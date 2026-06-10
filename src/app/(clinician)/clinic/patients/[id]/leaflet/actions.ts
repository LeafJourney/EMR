"use server";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { createLightContext } from "@/lib/orchestration/context";
import { formatDateOnly, formatDateInZone, fullName } from "@/lib/utils/format";
import { DEFAULT_TIME_ZONE } from "@/lib/utils/timezone";
import {
  extractNoteSection,
  extractActionItems,
  buildDeterministicNarrative,
  formatVisitModality,
  sanitizeReason,
  type LeafletData,
  type LeafletMedication,
} from "@/lib/domain/leaflet";

// ---------------------------------------------------------------------------
// EMR-149: Data assembly
// ---------------------------------------------------------------------------

export async function generateLeafletData(
  encounterId: string,
): Promise<{ ok: true; data: LeafletData } | { ok: false; error: string }> {
  const user = await requireUser();

  // Load encounter with patient — use separate queries for optional relations
  // to prevent a single missing relation from crashing the whole page
  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, organizationId: user.organizationId! },
    include: {
      patient: true,
      notes: { where: { status: "finalized" }, orderBy: { finalizedAt: "desc" }, take: 1 },
    },
  });

  if (!encounter) return { ok: false, error: "Encounter not found" };

  const patient = encounter.patient;

  const orgRow = await prisma.organization.findUnique({
    where: { id: user.organizationId! },
    select: { timeZone: true },
  });
  const timeZone = orgRow?.timeZone || DEFAULT_TIME_ZONE;

  // Load optional relations separately (so one failure doesn't block the page)
  const [medications, dosingRegimens, outcomeLogs, appointments, provider] = await Promise.allSettled([
    prisma.patientMedication.findMany({ where: { patientId: patient.id, active: true } }),
    prisma.dosingRegimen.findMany({ where: { patientId: patient.id, active: true }, include: { product: true } }),
    prisma.outcomeLog.findMany({ where: { patientId: patient.id }, orderBy: { loggedAt: "desc" }, take: 5 }),
    // FUTURE confirmed appointments only — an old confirmed appt would otherwise
    // surface a PAST "next appointment" date in the patient handout.
    prisma.appointment.findMany({ where: { patientId: patient.id, status: "confirmed", startAt: { gte: new Date() } }, orderBy: { startAt: "asc" }, take: 1 }),
    encounter.providerId
      ? prisma.provider.findUnique({ where: { id: encounter.providerId }, include: { user: { select: { firstName: true, lastName: true } } } })
      : Promise.resolve(null),
  ]);

  const medsResult = medications.status === "fulfilled" ? medications.value : [];
  const regimensResult = dosingRegimens.status === "fulfilled" ? dosingRegimens.value : [];
  const appointmentsResult = appointments.status === "fulfilled" ? appointments.value : [];
  const providerResult = provider.status === "fulfilled" ? provider.value : null;

  const note = encounter.notes[0];
  const blocks = (note?.blocks as any[]) ?? [];

  // Build medication list
  const meds: LeafletMedication[] = [];
  for (const r of regimensResult) {
    const p = (r as any).product;
    meds.push({
      name: p?.name ?? "Cannabis product",
      dosage: `${r.volumePerDose} ${r.volumeUnit}, ${r.frequencyPerDay}x daily`,
      instructions: r.patientInstructions,
      type: "cannabis",
    });
  }
  for (const m of medsResult) {
    meds.push({
      name: m.name,
      dosage: m.dosage ?? "",
      instructions: null,
      type: (m.type as any) ?? "prescription",
    });
  }

  // Extract note sections
  const assessment = extractNoteSection(blocks, "assessment");
  const plan = extractNoteSection(blocks, "plan");
  const subjective = extractNoteSection(blocks, "subjective");
  const summary = extractNoteSection(blocks, "summary");

  const discussed = subjective || assessment || summary || "Visit details not yet documented.";
  const nextSteps = extractActionItems(plan);
  const carePlanNotes = plan || "Care plan will be updated after your next visit.";

  // Follow-up — anchored to the clinician's documented follow-up in the SIGNED
  // note, plus a real FUTURE appointment date if one exists. Never a past date.
  const followUpSection = extractNoteSection(blocks, "followUp");
  const nextAppt = appointmentsResult[0];
  const apptLine = nextAppt
    ? `Your next appointment is ${formatDateInZone(nextAppt.startAt, timeZone)}.`
    : "";
  const followUp =
    [followUpSection, apptLine].filter(Boolean).join(" ").trim() ||
    "Please schedule a follow-up visit as advised by your care team.";

  // Narrative source
  const narrativeSource = [assessment, plan, subjective].filter(Boolean).join("\n\n");

  const data: LeafletData = {
    patientName: fullName(patient.firstName, patient.lastName),
    patientDOB: patient.dateOfBirth ? formatDateOnly(patient.dateOfBirth) : null,
    allergies: patient.allergies ?? [],
    visit: {
      date: formatDateInZone(encounter.scheduledFor ?? encounter.createdAt, timeZone),
      provider: providerResult?.user ? fullName(providerResult.user.firstName, providerResult.user.lastName) : "Your care team",
      modality: encounter.modality,
      reason: encounter.reason,
    },
    discussed,
    carePlan: meds,
    carePlanNotes,
    nextSteps:
      nextSteps.length > 0
        ? nextSteps
        : [
            "Follow the care plan your clinician reviewed with you today",
            "Log how you're feeling in the portal",
          ],
    followUp,
    narrativeSource,
    generatedAt: new Date().toISOString(),
  };

  return { ok: true, data };
}

// ---------------------------------------------------------------------------
// WS-B (audit minor #8): generate a leaflet from a note id, for the
// visit-completion panel's in-flow "Patient leaflet" preview. Resolves the
// note's encounter (org-scoped), assembles the leaflet data, and runs the
// narrative so the physician can preview the after-visit summary without
// leaving the wrap-up flow. Read-only — nothing is persisted here; the
// physician edits/saves via the full leaflet editor link-out.
// ---------------------------------------------------------------------------

export async function generateLeafletForNote(
  noteId: string,
): Promise<
  | { ok: true; narrative: string; data: LeafletData }
  | { ok: false; error: string }
> {
  const user = await requireUser();

  const note = await prisma.note.findFirst({
    where: { id: noteId, encounter: { organizationId: user.organizationId! } },
    select: { encounterId: true },
  });
  if (!note) return { ok: false, error: "Note not found" };

  const dataResult = await generateLeafletData(note.encounterId);
  if (!dataResult.ok) return dataResult;

  const narrativeResult = await generateLeafletNarrative(dataResult.data);
  return {
    ok: true,
    narrative: narrativeResult.ok ? narrativeResult.narrative : "",
    data: dataResult.data,
  };
}

// ---------------------------------------------------------------------------
// EMR-150: AI narrative generation
// ---------------------------------------------------------------------------

export type LeafletTone = "warm" | "clinical" | "brief";

export async function generateLeafletNarrative(
  data: LeafletData,
  tone: LeafletTone = "warm",
): Promise<{ ok: true; narrative: string } | { ok: false; error: string }> {
  if (!data.narrativeSource.trim()) {
    return { ok: true, narrative: buildDeterministicNarrative(data) };
  }

  const toneInstructions: Record<LeafletTone, string> = {
    warm: "Write 2-3 warm, encouraging sentences. Use the patient's first name. Speak to them like a kind care team member. Acknowledge their progress.",
    clinical: "Write 2-3 clear, structured sentences. Professional but not cold. Focus on what was assessed and what was decided.",
    brief: "Write exactly 1 sentence summarizing the visit and key outcome.",
  };

  const ctx = createLightContext({ jobId: `leaflet-narrative-${Date.now()}` });

  const prompt = `You are writing a short narrative recap for a patient's after-visit summary at Leafjourney, a cannabis care clinic.

PATIENT: ${data.patientName}
VISIT: ${data.visit.date}, ${formatVisitModality(data.visit.modality)} with ${data.visit.provider}
REASON: ${sanitizeReason(data.visit.reason) ?? "Follow-up"}

CLINICAL NOTES:
${data.narrativeSource}

MEDICATIONS: ${data.carePlan.map((m) => m.name).join(", ") || "None"}

TONE: ${toneInstructions[tone]}

RULES:
- Do NOT invent facts not in the clinical notes
- Do NOT use "As an AI" or clinical jargon
- Write at a 3rd-grade reading level
- Be truthful and specific — reference real details from the notes

Return ONLY the narrative text, no JSON, no markdown.`;

  try {
    const narrative = await ctx.model.complete(prompt, {
      maxTokens: 256,
      temperature: 0.35,
    });
    return { ok: true, narrative: narrative.trim() };
  } catch {
    return { ok: true, narrative: buildDeterministicNarrative(data) };
  }
}

// ---------------------------------------------------------------------------
// EMR-152: Save to chart
// ---------------------------------------------------------------------------

export async function saveLeafletToChart(
  encounterId: string,
  narrative: string,
  leafletData: LeafletData,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, organizationId: user.organizationId! },
    select: { patientId: true, organizationId: true },
  });

  if (!encounter) return { ok: false, error: "Encounter not found" };

  await prisma.document.create({
    data: {
      organizationId: encounter.organizationId,
      patientId: encounter.patientId,
      kind: "other",
      originalName: `Leaflet — ${leafletData.visit.date}.json`,
      mimeType: "application/json",
      sizeBytes: JSON.stringify({ ...leafletData, narrative }).length,
      storageKey: `leaflets/${encounter.patientId}/${encounterId}/${Date.now()}.json`,
      tags: ["leaflet", "after-visit-summary"],
      uploadedById: user.id,
      encounterId,
    },
  });

  return { ok: true };
}
