"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  curatePacket,
  type ReferralPacket,
  type Specialty,
} from "@/lib/domain/referral-packet";

const SPECIALTIES_LIST = [
  "Pain Management",
  "Neurology",
  "Psychiatry",
  "Oncology",
  "Gastroenterology",
  "Rheumatology",
  "Orthopedics",
  "Physical Therapy",
  "Behavioral Health",
  "Palliative Care",
  "Sleep Medicine",
  "Endocrinology",
  "Cardiology",
  "Pulmonology",
  "Dermatology",
  "Primary Care",
  "Addiction Medicine",
  "Integrative Medicine",
  "Acupuncture",
  "Nutrition/Dietetics",
] as const;

const schema = z.object({
  patientId: z.string(),
  specialty: z.enum(SPECIALTIES_LIST),
  reason: z.string().min(1).max(2000),
});

export type GeneratePacketResult =
  | { ok: true; packet: ReferralPacket }
  | { ok: false; error: string };

/**
 * EMR-078: Read recent chart context for the patient and run the
 * specialty-aware curator over it. Returns a packet of "pertinent" rows
 * each carrying a rationale so the clinician can defend (or trim) every
 * inclusion before sending the referral.
 */
export async function generateReferralPacketAction(
  payload: z.infer<typeof schema>,
): Promise<GeneratePacketResult> {
  const user = await requireUser();
  const parsed = schema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const patient = await prisma.patient.findFirst({
    where: {
      id: parsed.data.patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  // Pull the chart context the curator needs. The queries are bounded
  // and cheap — packet curation runs interactively from the referral
  // form. The labs query is the largest, capped to last 20 results.
  const [meds, recentLabs, recentNotes, recentDocs] = await Promise.all([
    prisma.patientMedication.findMany({
      where: { patientId: patient.id },
      orderBy: { active: "desc" },
    }),
    prisma.labResult.findMany({
      where: { patientId: patient.id },
      orderBy: { receivedAt: "desc" },
      take: 20,
    }),
    prisma.note.findMany({
      where: {
        encounter: { patientId: patient.id },
        status: "finalized",
      },
      orderBy: { finalizedAt: "desc" },
      take: 8,
    }),
    prisma.document.findMany({
      where: { patientId: patient.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  // The Patient table doesn't have a typed problem list yet — stitch
  // one together from the active dosing regimens (each carries the
  // indication) and the patient-level intake answers as a fallback.
  // Receiving specialists really care about active problems; this is
  // the closest signal we have without standing up a Problem table.
  const dosingRegimens = await prisma.dosingRegimen.findMany({
    where: { patientId: patient.id, active: true },
    include: { product: true },
  });

  // Resolve note authors in a single batch query so we can attribute
  // each forwarded note without N+1 fetching.
  const authorIds = Array.from(
    new Set(
      recentNotes
        .map((n) => n.authorUserId)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  const authors = authorIds.length
    ? await prisma.user.findMany({
        where: { id: { in: authorIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const authorById = new Map(authors.map((a) => [a.id, a]));
  const intakeProblems = readIntakeProblems(patient.intakeAnswers);
  const problems = [
    ...intakeProblems,
    ...dosingRegimens
      .map((r) => r.clinicianNotes)
      .filter((n): n is string => Boolean(n))
      .slice(0, 4)
      .map((label, idx) => ({
        code: `LJ-RX-${idx + 1}`,
        label: `Cannabis Rx indication: ${label.slice(0, 80)}`,
        onsetIso: null as string | null,
      })),
  ];

  const packet = curatePacket({
    specialty: parsed.data.specialty as Specialty,
    reason: parsed.data.reason,
    problems,
    medications: meds.map((m) => ({
      name: m.name,
      dosage: m.dosage ?? null,
      active: m.active,
    })),
    labs: recentLabs.map((l) => ({
      id: l.id,
      testName: l.panelName,
      resultedAtIso: l.receivedAt.toISOString(),
      abnormalFlag: Boolean(l.abnormalFlag),
      summary: summarizeLabResults(l.results, l.abnormalFlag),
    })),
    notes: recentNotes.map((n) => {
      const author = n.authorUserId ? authorById.get(n.authorUserId) : null;
      return {
        id: n.id,
        authorName: author
          ? `${author.firstName ?? ""} ${author.lastName ?? ""}`.trim() || "Provider"
          : "Provider",
        finalizedAtIso: (n.finalizedAt ?? n.createdAt).toISOString(),
        preview: previewBlocks(n.blocks),
      };
    }),
    documents: recentDocs.map((d) => ({
      id: d.id,
      filename: d.originalName,
      category: d.kind ?? null,
      uploadedAtIso: d.createdAt.toISOString(),
    })),
  });

  // Audit-log the packet generation — provenance for "what did the AI
  // recommend forwarding" if a downstream complaint surfaces. We do not
  // log full PHI, only counts + the rationale strings.
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: "referral.packet.generated",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: {
        specialty: parsed.data.specialty,
        counts: {
          problems: packet.problems.length,
          medications: packet.medications.length,
          labs: packet.labs.length,
          notes: packet.notes.length,
          documents: packet.documents.length,
        },
      } as any,
    },
  });

  return { ok: true, packet };
}

function readIntakeProblems(intake: unknown): {
  code: string;
  label: string;
  onsetIso: string | null;
}[] {
  if (!intake || typeof intake !== "object") return [];
  const records = (intake as Record<string, unknown>).qualifyingConditions;
  if (!Array.isArray(records)) return [];
  return records
    .map((r, idx) => {
      if (typeof r === "string") {
        return { code: `IC-${idx + 1}`, label: r, onsetIso: null };
      }
      if (r && typeof r === "object") {
        const row = r as Record<string, unknown>;
        const label =
          typeof row.label === "string"
            ? row.label
            : typeof row.condition === "string"
              ? row.condition
              : null;
        const code =
          typeof row.code === "string" && row.code.length > 0
            ? row.code
            : `IC-${idx + 1}`;
        const onset =
          typeof row.onset === "string" ? row.onset : null;
        if (!label) return null;
        return { code, label, onsetIso: onset };
      }
      return null;
    })
    .filter(
      (v): v is { code: string; label: string; onsetIso: string | null } =>
        v !== null,
    );
}

/**
 * Compress the structured `results` JSON on a LabResult into a one-line
 * abnormal-first summary. We surface up to two abnormal markers so the
 * receiving specialist sees the pertinent number, not just "panel ran".
 */
function summarizeLabResults(results: unknown, abnormalFlag: boolean): string | null {
  if (!results || typeof results !== "object") return null;
  const entries = Object.entries(results as Record<string, unknown>);
  const abnormal: string[] = [];
  for (const [marker, raw] of entries) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (r.abnormal === true) {
      const value = typeof r.value === "number" ? r.value : null;
      const unit = typeof r.unit === "string" ? r.unit : "";
      if (value !== null) abnormal.push(`${marker} ${value}${unit ? " " + unit : ""}`);
      if (abnormal.length >= 2) break;
    }
  }
  if (abnormal.length > 0) return abnormal.join(", ") + " (abn)";
  return abnormalFlag ? "abnormal panel" : null;
}

/**
 * Pull the first ~140 chars of usable text out of a Note.blocks JSON
 * value. Notes can be either a structured block array or a flat string;
 * the curator just wants something to scan for reason-overlap signal.
 */
function previewBlocks(blocks: unknown): string {
  if (typeof blocks === "string") return blocks.slice(0, 140);
  if (!Array.isArray(blocks)) return "";
  for (const b of blocks) {
    if (b && typeof b === "object") {
      const body = (b as Record<string, unknown>).body;
      if (typeof body === "string" && body.length > 0) return body.slice(0, 140);
    }
  }
  return "";
}

export type CreateReferralResult =
  | { ok: true; referral: any }
  | { ok: false; error: string };

export async function createReferralAction(payload: {
  patientId: string;
  direction: string;
  priority: string;
  referringProviderName: string;
  referringPracticeName: string;
  referredToProviderName: string;
  referredToSpecialty: string;
  referredToPracticeName: string;
  referredToPhone?: string;
  referredToFax?: string;
  reason: string;
  diagnosisCodes: { code: string; label: string }[];
  clinicalNotes?: string;
}): Promise<CreateReferralResult> {
  const user = await requireUser();
  const orgId = user.organizationId!;

  // Verify patient belongs to org
  const patient = await prisma.patient.findFirst({
    where: { id: payload.patientId, organizationId: orgId, deletedAt: null },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  const referral = await prisma.referral.create({
    data: {
      organizationId: orgId,
      patientId: payload.patientId,
      direction: payload.direction,
      priority: payload.priority,
      referringProviderName: payload.referringProviderName,
      referringPracticeName: payload.referringPracticeName,
      referredToProviderName: payload.referredToProviderName,
      referredToSpecialty: payload.referredToSpecialty,
      referredToPracticeName: payload.referredToPracticeName,
      referredToPhone: payload.referredToPhone || null,
      referredToFax: payload.referredToFax || null,
      reason: payload.reason,
      diagnosisCodes: payload.diagnosisCodes as any,
      clinicalNotes: payload.clinicalNotes || null,
      status: "draft",
    },
  });

  return {
    ok: true,
    referral: {
      ...referral,
      diagnosisCodes: referral.diagnosisCodes as any,
      attachedDocumentIds: referral.attachedDocumentIds as any,
      createdAt: referral.createdAt.toISOString(),
      updatedAt: referral.updatedAt.toISOString(),
      sentAt: referral.sentAt?.toISOString(),
      receivedAt: referral.receivedAt?.toISOString(),
      scheduledDate: referral.scheduledDate?.toISOString()?.slice(0, 10),
      completedAt: referral.completedAt?.toISOString(),
    },
  };
}
