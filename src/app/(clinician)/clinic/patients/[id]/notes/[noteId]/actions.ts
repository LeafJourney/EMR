"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  ForbiddenError,
  assertChartAccess,
  hasPermission,
  requiresCosignature,
} from "@/lib/rbac/permissions";
import { dispatch } from "@/lib/orchestration/dispatch";
import { runTick } from "@/lib/orchestration/runner";
import {
  resolveModelClient,
  isModelError,
  type ModelErrorCode,
} from "@/lib/orchestration/model-client";
import { z } from "zod";
import { freezeNoteSnapshot } from "@/lib/agents/guardrails/note-guardrails";
import { logger } from "@/lib/observability/log";

const blockSchema = z.object({
  heading: z.string(),
  body: z.string(),
});

const saveSchema = z.object({
  noteId: z.string(),
  blocks: z.array(blockSchema),
});

export type SaveNoteResult =
  | { ok: true; status: string }
  | { ok: false; error: string };

/**
 * Save note blocks without changing status.
 */
export async function saveNoteBlocks(
  noteId: string,
  blocks: { heading: string; body: string }[]
): Promise<SaveNoteResult> {
  const user = await requireUser();

  // EMR-786 — Back-office staff have read access to notes but cannot
  // edit. Front-office staff are denied entirely. Mid-levels +
  // clinicians + practice_owner all carry notes.edit.
  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Forbidden: read-only access to notes" };
  }

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { encounter: true },
  });
  if (!note) return { ok: false, error: "Note not found" };

  // Verify org access
  const encounter = await prisma.encounter.findFirst({
    where: {
      id: note.encounterId,
      organizationId: user.organizationId!,
    },
  });
  if (!encounter) return { ok: false, error: "Unauthorized" };

  // EMR-786 — Chart privacy gate. A note on a restricted chart can only
  // be edited by a user on the chart's provider allowlist.
  try {
    await assertChartAccess(user, encounter.patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Forbidden: chart is restricted" };
    }
    throw err;
  }

  await prisma.note.update({
    where: { id: noteId },
    data: { blocks: blocks as any },
  });

  revalidatePath(`/clinic/patients/${encounter.patientId}`);
  return { ok: true, status: note.status };
}

/**
 * Finalize a note: set status to finalized, record the author and timestamp,
 * then dispatch the note.finalized event which triggers the Coding Readiness Agent.
 */
export async function finalizeNote(noteId: string): Promise<SaveNoteResult> {
  const user = await requireUser();

  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Forbidden: read-only access to notes" };
  }

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { encounter: true },
  });
  if (!note) return { ok: false, error: "Note not found" };

  const encounter = await prisma.encounter.findFirst({
    where: {
      id: note.encounterId,
      organizationId: user.organizationId!,
    },
  });
  if (!encounter) return { ok: false, error: "Unauthorized" };

  try {
    await assertChartAccess(user, encounter.patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Forbidden: chart is restricted" };
    }
    throw err;
  }

  // EMR-786 — Mid-level providers cannot finalize on their own; the
  // note must be routed to a clinician for co-signature first. Mark
  // the note as "pending_cosign" and surface it on the clinician's
  // sign-off queue instead of moving straight to finalized.
  if (requiresCosignature(user)) {
    await prisma.note.update({
      where: { id: noteId },
      data: {
        // Reuse the existing status enum value used elsewhere in the
        // codebase for "ready for clinician sign-off". The note still
        // belongs to the mid-level as authorUserId.
        status: "pending_cosign",
        authorUserId: user.id,
      },
    });
    revalidatePath(`/clinic/patients/${encounter.patientId}`);
    return { ok: true, status: "pending_cosign" };
  }

  await prisma.note.update({
    where: { id: noteId },
    data: {
      status: "finalized",
      finalizedAt: new Date(),
      authorUserId: user.id,
    },
  });

  // Also mark the encounter as complete
  await prisma.encounter.update({
    where: { id: note.encounterId },
    data: { status: "complete", completedAt: new Date() },
  });

  // If every note for this encounter is now finalized, stamp
  // chartingCompletedAt so the Clinical Flow tile can compute carryover.
  await markChartingCompletedIfReady(note.encounterId);

  // Dispatch note.finalized → triggers Coding Agent + Physician Nudge Agent
  await dispatch({
    name: "note.finalized",
    noteId,
    encounterId: note.encounterId,
    finalizedBy: user.id,
  });

  // Dispatch encounter.completed → triggers Patient Outreach Agent
  await dispatch({
    name: "encounter.completed",
    encounterId: note.encounterId,
    patientId: encounter.patientId,
    completedAt: new Date(),
  });

  // In dev, run the queue inline so coding suggestions appear immediately
  if (process.env.NODE_ENV !== "production") {
    await runTick("inline-dev", 4);
  }

  revalidatePath(`/clinic/patients/${encounter.patientId}`);
  return { ok: true, status: "finalized" };
}

/**
 * If all notes for an encounter are finalized, set
 * Encounter.chartingCompletedAt to now (if not already set). This is the
 * documentation-complete marker, distinct from completedAt (= when the
 * physician stopped seeing the patient).
 */
async function markChartingCompletedIfReady(encounterId: string): Promise<void> {
  const unfinalized = await prisma.note.count({
    where: { encounterId, status: { not: "finalized" } },
  });
  if (unfinalized > 0) return;

  await prisma.encounter.update({
    where: { id: encounterId },
    data: { chartingCompletedAt: new Date() },
  });
}

/**
 * Save blocks and finalize in a single action.
 */
export async function saveAndFinalizeNote(
  noteId: string,
  blocks: { heading: string; body: string }[]
): Promise<SaveNoteResult> {
  const user = await requireUser();

  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Forbidden: read-only access to notes" };
  }

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { encounter: true },
  });
  if (!note) return { ok: false, error: "Note not found" };

  const encounter = await prisma.encounter.findFirst({
    where: {
      id: note.encounterId,
      organizationId: user.organizationId!,
    },
  });
  if (!encounter) return { ok: false, error: "Unauthorized" };

  try {
    await assertChartAccess(user, encounter.patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Forbidden: chart is restricted" };
    }
    throw err;
  }

  // EMR-131: Freeze a snapshot of the AI draft + transcript at sign
  // time. Hashes go to AuditLog so we can prove provenance later
  // (defense against "the AI made that up" complaints).
  const snapshot = buildSnapshotFromNoteBlocks(note.blocks, blocks);

  // EMR-786 — Mid-level providers route to pending_cosign instead of
  // finalized; the clinician sign-off queue picks them up.
  if (requiresCosignature(user)) {
    await prisma.note.update({
      where: { id: noteId },
      data: {
        blocks: blocks as any,
        status: "pending_cosign",
        authorUserId: user.id,
      },
    });
    revalidatePath(`/clinic/patients/${encounter.patientId}`);
    return { ok: true, status: "pending_cosign" };
  }

  await prisma.note.update({
    where: { id: noteId },
    data: {
      blocks: blocks as any,
      status: "finalized",
      finalizedAt: new Date(),
      authorUserId: user.id,
    },
  });

  if (snapshot) {
    await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId!,
        actorUserId: user.id,
        action: "note.finalized.snapshot",
        subjectType: "Note",
        subjectId: noteId,
        metadata: snapshot as any,
      },
    });
  }

  // Also mark the encounter as complete
  await prisma.encounter.update({
    where: { id: note.encounterId },
    data: { status: "complete", completedAt: new Date() },
  });

  // If every note for this encounter is now finalized, stamp
  // chartingCompletedAt so the Clinical Flow tile can compute carryover.
  await markChartingCompletedIfReady(note.encounterId);

  // Dispatch note.finalized → triggers Coding Agent + Physician Nudge Agent
  await dispatch({
    name: "note.finalized",
    noteId,
    encounterId: note.encounterId,
    finalizedBy: user.id,
  });

  // Dispatch encounter.completed → triggers Patient Outreach Agent
  await dispatch({
    name: "encounter.completed",
    encounterId: note.encounterId,
    patientId: encounter.patientId,
    completedAt: new Date(),
  });

  if (process.env.NODE_ENV !== "production") {
    await runTick("inline-dev", 4);
  }

  revalidatePath(`/clinic/patients/${encounter.patientId}`);
  return { ok: true, status: "finalized" };
}

/**
 * Pull the guardrails block off the original AI draft (planted by
 * processTranscript) and freeze a snapshot pairing the original draft
 * blocks with the clinician-edited blocks the user is signing.
 */
function buildSnapshotFromNoteBlocks(
  storedBlocks: unknown,
  signedBlocks: { heading: string; body: string }[],
) {
  if (!Array.isArray(storedBlocks)) return null;
  const guardrailsBlock = storedBlocks.find(
    (b: any) => b && b.heading === "_guardrails",
  ) as any;
  if (!guardrailsBlock?.metadata?.guardrails) return null;
  const draftBlocks = (storedBlocks as any[])
    .filter((b: any) => b && b.heading !== "_guardrails")
    .map((b: any) => ({ type: b.type ?? "block", body: b.body ?? "" }));
  const transcript = guardrailsBlock.metadata.transcriptPreview ?? "";
  const guardrails = guardrailsBlock.metadata.guardrails;
  return {
    ...freezeNoteSnapshot({
      draftBlocks,
      transcript,
      hallucinationConfidence: guardrails.hallucinationConfidence ?? 1,
      redactionCounts: guardrails.redactionCounts ?? {
        phone: 0, ssn: 0, email: 0, mrn: 0, dob: 0, name: 0,
      },
      flaggedSpans: guardrails.flaggedSpans ?? [],
    }),
    // Track whether the clinician edited the AI draft before signing.
    blockCountDraft: draftBlocks.length,
    blockCountSigned: signedBlocks.length,
  };
}

// ---------------------------------------------------------------------------
// Emotional Vitals — EMR-134
// ---------------------------------------------------------------------------
// Persists the clinician's emoji read of the patient's demeanor on the
// encounter (briefingContext.patientDemeanor). No schema migration needed —
// briefingContext is already a Json field used for visit metadata.

export const PATIENT_DEMEANOR_OPTIONS = [
  { emoji: "\u{1F60A}", label: "Bright", value: "bright" },
  { emoji: "\u{1F642}", label: "Positive", value: "positive" },
  { emoji: "\u{1F610}", label: "Neutral", value: "neutral" },
  { emoji: "\u{1F614}", label: "Withdrawn", value: "withdrawn" },
  { emoji: "\u{1F622}", label: "Distressed", value: "distressed" },
] as const;

export type PatientDemeanor = typeof PATIENT_DEMEANOR_OPTIONS[number]["value"];

const VALID_DEMEANORS: ReadonlySet<string> = new Set(
  PATIENT_DEMEANOR_OPTIONS.map((o) => o.value),
);

export async function saveEmotionalVital(
  encounterId: string,
  demeanor: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!VALID_DEMEANORS.has(demeanor)) {
    return { ok: false, error: "Unknown demeanor value" };
  }

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, organizationId: user.organizationId! },
    select: { id: true, briefingContext: true, patientId: true },
  });
  if (!encounter) return { ok: false, error: "Unauthorized" };

  const ctx =
    encounter.briefingContext && typeof encounter.briefingContext === "object"
      ? (encounter.briefingContext as Record<string, unknown>)
      : {};

  await prisma.encounter.update({
    where: { id: encounterId },
    data: {
      briefingContext: {
        ...ctx,
        patientDemeanor: demeanor,
        patientDemeanorRecordedAt: new Date().toISOString(),
        patientDemeanorRecordedBy: user.id,
      },
    },
  });

  revalidatePath(`/clinic/patients/${encounter.patientId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// AI Section Refiner
// ---------------------------------------------------------------------------

export type RefineMode = "expand" | "clarify" | "clinical" | "concise" | "dosing";

const REFINE_INSTRUCTIONS: Record<RefineMode, string> = {
  expand: "Expand this section with more clinical detail, supporting evidence, and specific observations. Keep clinical tone.",
  clarify: "Rewrite this section to be clearer and more precise. Remove ambiguity. Keep the same information but improve readability.",
  clinical: "Make this section more clinically rigorous. Use proper medical terminology, reference specific findings, and ensure it meets documentation standards.",
  concise: "Make this section more concise. Remove redundancy and filler while preserving all clinically relevant information.",
  dosing: "Add specific cannabis dosing details — milligrams, frequency, delivery method, titration instructions, and any relevant product information.",
};

export type RefineResult =
  | { ok: true; refined: string }
  | { ok: false; error: string; code: ModelErrorCode | "not_found" | "unauthorized" };

export async function refineSection(
  noteId: string,
  sectionHeading: string,
  sectionBody: string,
  mode: RefineMode,
): Promise<RefineResult> {
  const user = await requireUser();

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: {
      encounter: {
        include: { patient: { select: { firstName: true, lastName: true, presentingConcerns: true } } },
      },
    },
  });
  if (!note) return { ok: false, error: "Note not found", code: "not_found" };

  const encounter = await prisma.encounter.findFirst({
    where: { id: note.encounterId, organizationId: user.organizationId! },
  });
  if (!encounter) return { ok: false, error: "Unauthorized", code: "unauthorized" };

  const patient = note.encounter.patient;
  const instruction = REFINE_INSTRUCTIONS[mode];

  const prompt = `You are an AI clinical writing assistant for a cannabis care EMR. Refine the following note section.

PATIENT: ${patient.firstName} ${patient.lastName}
PRESENTING CONCERNS: ${patient.presentingConcerns ?? "Not documented"}
SECTION: ${sectionHeading}

CURRENT TEXT:
${sectionBody}

INSTRUCTION: ${instruction}

Return ONLY the refined text — no JSON, no markdown, no explanation. Just the improved section content.`;

  const model = resolveModelClient();

  try {
    // Note sections are short paragraphs; 256 is plenty and keeps us well
    // under common credit ceilings. A generous SOAP subsection is ~200 words
    // which is ~260 tokens.
    const refined = await model.complete(prompt, {
      maxTokens: 256,
      temperature: 0.25,
    });
    return { ok: true, refined: refined.trim() };
  } catch (err) {
    // Log the full provider detail for our own debugging — but send ONLY
    // the friendly message to the client. Raw provider JSON must never
    // reach the clinician's screen (Art. VI §2: "no cryptic error messages").
    if (isModelError(err)) {
      logger.warn({
        event: "clinic.refine_section.model_error",
        code: err.code,
        status: err.status,
        providerBody: err.providerBody,
      });
      return { ok: false, error: err.friendly, code: err.code };
    }
    logger.warn({ event: "clinic.refine_section.unexpected_error", err });
    return {
      ok: false,
      error: "AI refinement failed. Try again in a moment.",
      code: "unknown",
    };
  }
}
