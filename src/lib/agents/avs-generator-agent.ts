import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { formatDateInZone, formatDateOnly, fullName } from "@/lib/utils/format";
import { DEFAULT_TIME_ZONE } from "@/lib/utils/timezone";
import {
  buildDeterministicNarrative,
  extractActionItems,
  extractNoteSection,
  type LeafletData,
  type LeafletMedication,
} from "@/lib/domain/leaflet";
import { NOTE_BLOCK_LABELS, type NoteBlock } from "@/lib/domain/notes";
import { buildAvsDocument } from "@/lib/domain/avs/build-avs-document";
import { resolvePatientLanguage } from "@/lib/domain/avs/localization";

// ---------------------------------------------------------------------------
// AVS Generator Agent — EMR-1149 (Dynamic Patient-Facing Summaries)
// ---------------------------------------------------------------------------
// Fires on `note.finalized` (the chart-sign / encounter-close signal). Compiles
// the signed note + the patient's language preference + a safe literacy target,
// runs the deterministic AVS pipeline (decompose → readability → localize →
// calendar/roadmap), and persists a DRAFT AfterVisitSummary keyed to the note.
//
// Idempotent per note (`AfterVisitSummary.noteId @unique`): re-running refreshes
// a draft but never clobbers one the provider has already RELEASED (EMR-1152).
// Deterministic — no model call — so it runs unattended on the job queue and is
// reproducible for the de-identified research datasets the Data Collection
// Philosophy requires. Generation is read-only to the chart + writes only the
// summary draft, so no approval gate.
// ---------------------------------------------------------------------------

const AGENT_NAME = "avsGenerator";
const AGENT_VERSION = "1.0.0";
export const AVS_GENERATED_ACTION = "avs.generated";

const input = z.object({
  noteId: z.string(),
  encounterId: z.string().optional(),
});

const output = z.object({
  skipped: z.boolean(),
  reason: z.string().optional(),
  afterVisitSummaryId: z.string().nullable(),
  language: z.string().nullable(),
  readabilityGrade: z.number().nullable(),
});

/** Reassemble the verbatim signed-note text for the verification panel. */
function renderSourceNote(blocks: NoteBlock[]): string {
  return blocks
    .filter((b) => b?.body?.trim())
    .map((b) => `${NOTE_BLOCK_LABELS[b.type] ?? b.heading}\n${b.body.trim()}`)
    .join("\n\n");
}

export const avsGeneratorAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: AGENT_NAME,
  version: AGENT_VERSION,
  description:
    "Generates the plain-language, literacy- and language-matched after-visit " +
    "summary on chart-sign and persists it as a draft for provider release. " +
    "Deterministic; idempotent per note; never overwrites a released summary.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.note", "read.encounter", "read.patient", "write.chartSummary"],
  requiresApproval: false,

  async run({ noteId }, ctx) {
    ctx.assertCan("read.note");

    const note = await prisma.note.findUnique({
      where: { id: noteId },
      include: { encounter: { include: { patient: true } } },
    });
    if (!note) {
      ctx.log("warn", "AVS skipped — note not found", { noteId });
      return { skipped: true, reason: "note_not_found", afterVisitSummaryId: null, language: null, readabilityGrade: null };
    }
    if (note.status !== "finalized" && note.status !== "amended") {
      ctx.log("info", "AVS skipped — note not signed", { noteId, status: note.status });
      return { skipped: true, reason: "note_not_signed", afterVisitSummaryId: null, language: null, readabilityGrade: null };
    }

    const encounter = note.encounter;
    const patient = encounter.patient;

    // Never clobber a summary the provider already released.
    const existing = await prisma.afterVisitSummary.findUnique({
      where: { noteId },
      select: { id: true, status: true },
    });
    if (existing?.status === "released") {
      ctx.log("info", "AVS skipped — already released", { noteId, avsId: existing.id });
      return { skipped: true, reason: "already_released", afterVisitSummaryId: existing.id, language: null, readabilityGrade: null };
    }

    ctx.assertCan("read.patient");

    const [orgRow, provider, regimens, meds, appts] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: encounter.organizationId },
        select: { timeZone: true },
      }),
      encounter.providerId
        ? prisma.provider.findUnique({
            where: { id: encounter.providerId },
            include: { user: { select: { firstName: true, lastName: true } } },
          })
        : Promise.resolve(null),
      prisma.dosingRegimen.findMany({
        where: { patientId: patient.id, active: true },
        include: { product: true },
      }),
      prisma.patientMedication.findMany({ where: { patientId: patient.id, active: true } }),
      prisma.appointment.findMany({
        where: { patientId: patient.id, status: "confirmed", startAt: { gte: new Date() } },
        orderBy: { startAt: "asc" },
        take: 1,
      }),
    ]);

    const timeZone = orgRow?.timeZone || DEFAULT_TIME_ZONE;
    const blocks = (Array.isArray(note.blocks) ? note.blocks : []) as unknown as NoteBlock[];

    const carePlan: LeafletMedication[] = [
      ...regimens.map((r): LeafletMedication => ({
        name: (r as { product?: { name?: string } }).product?.name ?? "Cannabis product",
        dosage: `${r.volumePerDose} ${r.volumeUnit}, ${r.frequencyPerDay}x daily`,
        instructions: r.patientInstructions,
        type: "cannabis",
      })),
      ...meds.map((m): LeafletMedication => ({
        name: m.name,
        dosage: m.dosage ?? "",
        instructions: null,
        type: (m.type as LeafletMedication["type"]) ?? "prescription",
      })),
    ];

    const assessment = extractNoteSection(blocks, "assessment");
    const plan = extractNoteSection(blocks, "plan");
    const subjective = extractNoteSection(blocks, "summary");
    const followUpSection = extractNoteSection(blocks, "followUp");

    const nextAppt = appts[0];
    const apptLine = nextAppt ? `Your next appointment is ${formatDateInZone(nextAppt.startAt, timeZone)}.` : "";
    const followUp =
      [followUpSection, apptLine].filter(Boolean).join(" ").trim() ||
      "Please schedule a follow-up visit as advised by your care team.";

    const leafletData: LeafletData = {
      patientName: fullName(patient.firstName, patient.lastName),
      patientDOB: patient.dateOfBirth ? formatDateOnly(patient.dateOfBirth) : null,
      allergies: patient.allergies ?? [],
      visit: {
        date: formatDateInZone(encounter.scheduledFor ?? encounter.createdAt, timeZone),
        provider: provider?.user ? fullName(provider.user.firstName, provider.user.lastName) : "Your care team",
        modality: encounter.modality,
        reason: encounter.reason,
      },
      discussed: subjective || assessment || "Visit details not yet documented.",
      carePlan,
      carePlanNotes: plan || "Care plan will be updated after your next visit.",
      nextSteps: extractActionItems(plan),
      followUp,
      narrativeSource: [assessment, plan, subjective].filter(Boolean).join("\n\n"),
      generatedAt: new Date().toISOString(),
    };

    const language = resolvePatientLanguage(patient.intakeAnswers);

    const doc = buildAvsDocument({
      patientFirstName: patient.firstName,
      visitDate: leafletData.visit.date,
      provider: leafletData.visit.provider,
      planText: plan,
      baseNarrative: buildDeterministicNarrative(leafletData),
      nextSteps:
        leafletData.nextSteps.length > 0
          ? leafletData.nextSteps
          : ["Follow the care plan your clinician reviewed with you today.", "Log how you're feeling in the portal."],
      followUp,
      language,
      sourceNote: renderSourceNote(blocks) || leafletData.narrativeSource,
    });

    const payload = doc as unknown as Prisma.InputJsonValue;
    const saved = await prisma.afterVisitSummary.upsert({
      where: { noteId },
      create: {
        organizationId: encounter.organizationId,
        encounterId: encounter.id,
        noteId,
        patientId: patient.id,
        language,
        readabilityGrade: doc.readability.grade,
        payload,
      },
      update: {
        language,
        readabilityGrade: doc.readability.grade,
        payload,
        generatedAt: new Date(),
      },
      select: { id: true },
    });

    ctx.assertCan("write.chartSummary");
    await writeAgentAudit(
      AGENT_NAME,
      AGENT_VERSION,
      encounter.organizationId,
      AVS_GENERATED_ACTION,
      { type: "Note", id: noteId },
      {
        afterVisitSummaryId: saved.id,
        language,
        readabilityGrade: doc.readability.grade,
        meetsTarget: doc.readability.meetsTarget,
        medications: doc.decomposed.medications.length,
        calendars: doc.calendars.length,
      },
    );

    ctx.log("info", "AVS draft generated", {
      noteId,
      avsId: saved.id,
      language,
      grade: doc.readability.grade,
    });

    return {
      skipped: false,
      afterVisitSummaryId: saved.id,
      language,
      readabilityGrade: doc.readability.grade,
    };
  },
};
