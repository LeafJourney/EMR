"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  ForbiddenError,
  assertChartAccess,
  canDocumentObjective,
  hasPermission,
  requiresCosignature,
} from "@/lib/rbac/permissions";
import { primaryRole } from "@/lib/rbac/roles";
import {
  composeObjectiveBody,
  type Vitals,
} from "@/lib/clinical/objective-vitals";
import { dispatch } from "@/lib/orchestration/dispatch";
import { runTick } from "@/lib/orchestration/runner";
import {
  resolveModelClient,
  isModelError,
  type ModelErrorCode,
} from "@/lib/orchestration/model-client";
import { z } from "zod";
import { freezeNoteSnapshot } from "@/lib/agents/guardrails/note-guardrails";
import { ensureConsentDisclaimerBlock } from "@/lib/clinical/ai-consent-disclaimer";
import { logger } from "@/lib/observability/log";
import { recordFeedback } from "@/lib/agents/memory/agent-feedback";
import {
  PATIENT_DEMEANOR_OPTIONS,
  type PatientDemeanor,
} from "@/lib/domain/notes";
import { advanceVisitState } from "@/lib/domain/visit-state";
import type { VisitCompletionReleasePayload } from "@/lib/domain/visit-completion-selection";
import { deriveFollowUpBooking } from "@/lib/domain/visit-completion";

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

  // A signed note (finalized or amended) is a locked legal record. The editor
  // hides the Save button once a note leaves draft, but the server
  // must enforce it too: a direct action call (or a stale client) must not
  // silently mutate a signed note. Mirrors the guard saveObjectiveDocumentation
  // already applies. Amending a signed note is a deliberate, audited flow — not
  // a plain block save.
  if (note.status === "finalized" || note.status === "amended") {
    return { ok: false, error: "This note is signed and can no longer be edited." };
  }

  // EMR-784: AI-drafted notes (voice/ambient scribe) must keep the
  // patient verbal-consent disclaimer even if the clinician edited the
  // draft. Re-inject if it was stripped.
  const blocksToSave = note.aiDrafted
    ? ensureConsentDisclaimerBlock(blocks)
    : blocks;

  await prisma.note.update({
    where: { id: noteId },
    data: { blocks: blocksToSave as any },
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

  // Idempotent finalize — a note already finalized must NOT re-run the
  // transition side effects. dispatch() has no dedup, so a second
  // note.finalized / encounter.completed duplicates physician tasks, patient
  // outreach drafts, and clinical observations. Short-circuit on the terminal
  // state (the cosign path below is reached only by non-finalized notes).
  if (note.status === "finalized") {
    return { ok: true, status: "finalized" };
  }
  // EMR-784: Before finalizing, ensure an AI-drafted note still carries
  // the patient verbal-consent disclaimer. Defends against a clinician
  // deleting it during cleanup before signing.
  const blocksAtFinalize =
    note.aiDrafted && Array.isArray(note.blocks)
      ? ensureConsentDisclaimerBlock(
          note.blocks as unknown as { heading?: string; body?: string }[],
        )
      : null;

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
        ...(blocksAtFinalize ? { blocks: blocksAtFinalize as any } : {}),
      },
    });
    revalidatePath(`/clinic/patients/${encounter.patientId}`);
    return { ok: true, status: "pending_cosign" };
  }

  // One timestamp shared by the note write, the encounter completion, and the
  // event payloads — so DB rows and downstream automation agree on the instant.
  const finalizedAt = new Date();

  await prisma.note.update({
    where: { id: noteId },
    data: {
      ...(blocksAtFinalize ? { blocks: blocksAtFinalize as any } : {}),
      status: "finalized",
      finalizedAt,
      authorUserId: user.id,
    },
  });

  // Move the encounter to complete through the visit-state spine.
  // `transitioned` is true only on the actual transition into complete, so a
  // second note finalizing on an already-complete encounter does not re-fire
  // encounter.completed.
  const { transitioned: encounterCompleted } = await advanceVisitState(
    encounter,
    "complete",
    user.id,
    { at: finalizedAt },
  );

  // If every note for this encounter is now finalized, stamp
  // chartingCompletedAt so the Clinical Flow tile can compute carryover.
  await markChartingCompletedIfReady(note.encounterId, finalizedAt);

  // note.finalized → Coding Agent + Physician Nudge Agent. This call is the
  // transition into finalized (guarded above), so it fires exactly once.
  await dispatch({
    name: "note.finalized",
    noteId,
    encounterId: note.encounterId,
    finalizedBy: user.id,
  });

  // encounter.completed → Patient Outreach / Outcome agents. Only on the
  // transition into complete.
  if (encounterCompleted) {
    await dispatch({
      name: "encounter.completed",
      encounterId: note.encounterId,
      patientId: encounter.patientId,
      completedAt: finalizedAt,
    });
  }

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
async function markChartingCompletedIfReady(
  encounterId: string,
  at: Date = new Date(),
): Promise<void> {
  const unfinalized = await prisma.note.count({
    where: { encounterId, status: { not: "finalized" } },
  });
  if (unfinalized > 0) return;

  // Stamp only if not already set — preserve the FIRST completion instant so a
  // note added to an already-charted encounter doesn't rewrite history.
  await prisma.encounter.updateMany({
    where: { id: encounterId, chartingCompletedAt: null },
    data: { chartingCompletedAt: at },
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
  // Idempotent finalize — see finalizeNote. An already-finalized note must not
  // re-dispatch the transition events (dispatch() has no dedup).
  if (note.status === "finalized") {
    return { ok: true, status: "finalized" };
  }
  // EMR-784: AI-drafted notes (voice/ambient scribe) must keep the
  // patient verbal-consent disclaimer through finalize, even if the
  // clinician edited it out.
  const blocksToFinalize = note.aiDrafted
    ? ensureConsentDisclaimerBlock(blocks)
    : blocks;

  // EMR-131: Freeze a snapshot of the AI draft + transcript at sign
  // time. Hashes go to AuditLog so we can prove provenance later
  // (defense against "the AI made that up" complaints).
  const snapshot = buildSnapshotFromNoteBlocks(note.blocks, blocksToFinalize);
  // EMR-786 — Mid-level providers route to pending_cosign instead of
  // finalized; the clinician sign-off queue picks them up.
  if (requiresCosignature(user)) {
    await prisma.note.update({
      where: { id: noteId },
      data: {
        blocks: blocksToFinalize as any,
        status: "pending_cosign",
        authorUserId: user.id,
      },
    });
    revalidatePath(`/clinic/patients/${encounter.patientId}`);
    return { ok: true, status: "pending_cosign" };
  }

  // One shared timestamp for the note write, encounter completion, and events.
  const finalizedAt = new Date();

  await prisma.note.update({
    where: { id: noteId },
    data: {
      blocks: blocksToFinalize as any,
      status: "finalized",
      finalizedAt,
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

  // Move the encounter to complete via the visit-state spine — transition-gated
  // so encounter.completed fires exactly once.
  const { transitioned: encounterCompleted } = await advanceVisitState(
    encounter,
    "complete",
    user.id,
    { at: finalizedAt },
  );

  // If every note for this encounter is now finalized, stamp
  // chartingCompletedAt so the Clinical Flow tile can compute carryover.
  await markChartingCompletedIfReady(note.encounterId, finalizedAt);

  // Dispatch note.finalized → triggers Coding Agent + Physician Nudge Agent
  await dispatch({
    name: "note.finalized",
    noteId,
    encounterId: note.encounterId,
    finalizedBy: user.id,
  });

  // Dispatch encounter.completed → triggers Patient Outreach Agent. Only on the
  // transition into complete.
  if (encounterCompleted) {
    await dispatch({
      name: "encounter.completed",
      encounterId: note.encounterId,
      patientId: encounter.patientId,
      completedAt: finalizedAt,
    });
  }

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

// Definitions moved to @/lib/domain/notes to prevent "use server" client bundle issues

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
// Objective / vitals staffing workflow
// ---------------------------------------------------------------------------
// Rooming staff (MAs) document the Objective section before the physician
// sees the patient. This action is scoped to the "findings" block ONLY —
// it never touches Assessment/Plan/Subjective and never finalizes — gated by
// the `notes.objective.document` capability (canDocumentObjective).

const vitalsSchema = z.object({
  systolic: z.number().min(0).max(400).nullable().optional(),
  diastolic: z.number().min(0).max(300).nullable().optional(),
  heartRate: z.number().min(0).max(400).nullable().optional(),
  temperature: z.number().min(50).max(115).nullable().optional(),
  tempUnit: z.enum(["F", "C"]).optional(),
  respiratoryRate: z.number().min(0).max(120).nullable().optional(),
  spo2: z.number().min(0).max(100).nullable().optional(),
  weight: z.number().min(0).max(2000).nullable().optional(),
  weightUnit: z.enum(["lb", "kg"]).optional(),
  pain: z.number().min(0).max(10).nullable().optional(),
});

const objectiveDocSchema = z.object({
  vitals: vitalsSchema,
  exam: z.string().max(8000),
});

export async function saveObjectiveDocumentation(
  noteId: string,
  input: { vitals: Vitals; exam: string },
): Promise<SaveNoteResult> {
  const user = await requireUser();

  // Scoped capability — MAs carry this without full `notes.edit`.
  if (!canDocumentObjective(user)) {
    return { ok: false, error: "Forbidden: cannot document the Objective section" };
  }

  const parsed = objectiveDocSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid vitals or exam input" };
  }

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { encounter: true },
  });
  if (!note) return { ok: false, error: "Note not found" };

  const encounter = await prisma.encounter.findFirst({
    where: { id: note.encounterId, organizationId: user.organizationId! },
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

  if (note.status === "finalized") {
    return { ok: false, error: "This note is signed and can no longer be edited." };
  }

  const body = composeObjectiveBody(parsed.data);
  const attribution = {
    objectiveVitals: parsed.data.vitals,
    objectiveExam: parsed.data.exam,
    documentedByUserId: user.id,
    documentedByName: `${user.firstName} ${user.lastName}`.trim(),
    documentedByRole: primaryRole(user.roles),
    documentedAt: new Date().toISOString(),
  };

  // Merge into ONLY the findings block; every other block is preserved
  // byte-for-byte (including the internal _scribe / _guardrails blocks).
  const existing: any[] = Array.isArray(note.blocks) ? (note.blocks as any[]) : [];
  let found = false;
  const nextBlocks = existing.map((b) => {
    if (b && typeof b === "object" && (b as any).type === "findings") {
      found = true;
      return {
        ...b,
        heading: (b as any).heading ?? "Objective",
        body,
        metadata: { ...((b as any).metadata ?? {}), ...attribution },
      };
    }
    return b;
  });
  if (!found) {
    nextBlocks.push({ type: "findings", heading: "Objective", body, metadata: attribution });
  }

  await prisma.note.update({
    where: { id: noteId },
    data: { blocks: nextBlocks as any },
  });

  // Audit the staff PHI write (non-physician documenting on the chart).
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: "note.objective.documented",
      subjectType: "Note",
      subjectId: noteId,
      metadata: {
        documentedByRole: attribution.documentedByRole,
        vitals: parsed.data.vitals as any,
      },
    },
  });

  revalidatePath(`/clinic/patients/${encounter.patientId}`);
  return { ok: true, status: note.status };
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
  | { ok: false; error: string; code: ModelErrorCode | "not_found" | "unauthorized" | "unavailable" };

// The stub / unconfigured model returns a human-readable "unavailable" notice
// rather than throwing. Detect it so we surface an honest failure instead of
// silently overwriting the clinician's section with placeholder boilerplate.
const AI_UNAVAILABLE_RE = /unavailable in this environment|AI output unavailable|^\s*(draft|summary) placeholder/i;

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
    const refined = (
      await model.complete(prompt, {
        maxTokens: 256,
        temperature: 0.25,
      })
    ).trim();
    // Never clobber the clinician's text with an "AI unavailable" notice or an
    // empty completion — report an honest, content-preserving failure instead.
    if (!refined || AI_UNAVAILABLE_RE.test(refined)) {
      return {
        ok: false,
        error:
          "AI refinement isn't available in this environment yet — your text was left unchanged.",
        code: "unavailable",
      };
    }
    return { ok: true, refined };
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
      error: "AI refinement is temporarily unavailable — your text was left unchanged.",
      code: "unknown",
    };
  }
}

// ---------------------------------------------------------------------------
// Coding approval — EMR-1097 (B4)
// ---------------------------------------------------------------------------
// The Coding Readiness Agent attaches suggestions to a finalized note; nothing
// downstream (charge extraction → claim construction) may run until the
// physician approves them here. Approval is recorded on the CodingSuggestion
// row, audited, and announced via the typed coding.approved event.

const approveCodingSchema = z.object({
  icd10: z
    .array(z.object({ code: z.string().min(1), label: z.string().optional() }))
    .max(50),
  emLevel: z.string().nullable(),
  modified: z.boolean(),
});

export type ApproveCodingResult =
  | { ok: true; status: "approved" | "modified"; approvedByName: string; approvedAt: string }
  | { ok: false; error: string };

export async function approveCodingSuggestion(
  noteId: string,
  input: {
    icd10: { code: string; label?: string }[];
    emLevel: string | null;
    modified: boolean;
  },
): Promise<ApproveCodingResult> {
  const user = await requireUser();

  // Same gate as finalize — coding approval is a signing-level decision.
  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Forbidden: read-only access to notes" };
  }

  const parsed = approveCodingSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid coding approval input" };
  }
  if (parsed.data.icd10.length === 0 && !parsed.data.emLevel) {
    return { ok: false, error: "Approve at least one ICD-10 code or an E/M level." };
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

  if (note.status !== "finalized" && note.status !== "amended") {
    return { ok: false, error: "Coding can only be approved on a signed note." };
  }

  const suggestion = await prisma.codingSuggestion.findUnique({
    where: { noteId },
  });
  if (!suggestion) {
    return { ok: false, error: "No coding suggestion exists for this note yet." };
  }

  const approvedAt = new Date();
  const approvedByName = `${user.firstName} ${user.lastName}`.trim();
  const status = parsed.data.modified ? "modified" : "approved";
  const approvedIcd10Payload = parsed.data.icd10.map((c) => ({
    code: c.code,
    label: c.label ?? "",
  }));

  // Idempotent by construction: CodingSuggestion is keyed by noteId, so a
  // re-approval UPDATES the same decision row rather than duplicating it.
  await prisma.codingSuggestion.update({
    where: { noteId },
    data: {
      status,
      approvedById: user.id,
      approvedByName,
      approvedAt,
      approvedIcd10: approvedIcd10Payload,
      approvedEmLevel: parsed.data.emLevel,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: "coding.approved",
      subjectType: "CodingSuggestion",
      subjectId: suggestion.id,
      metadata: {
        noteId,
        encounterId: note.encounterId,
        status,
        modified: parsed.data.modified,
        codeCount: approvedIcd10Payload.length,
        emLevel: parsed.data.emLevel,
        reapproval: suggestion.status != null && suggestion.status !== "suggested",
      } as any,
    },
  });

  // coding.approved → Encounter Intelligence (charge extraction) + Claim
  // Construction. Carries the approved codes so billing reconciles against
  // the physician's decision, not the raw suggestion.
  await dispatch({
    name: "coding.approved",
    noteId,
    encounterId: note.encounterId,
    patientId: encounter.patientId,
    organizationId: user.organizationId!,
    approvedBy: user.id,
    approvedIcd10: approvedIcd10Payload.map((c) => c.code),
    approvedEmLevel: parsed.data.emLevel,
  });

  // In dev, run the queue inline so charges appear immediately.
  if (process.env.NODE_ENV !== "production") {
    await runTick("inline-dev", 4);
  }

  revalidatePath(`/clinic/patients/${encounter.patientId}`);
  return {
    ok: true,
    status,
    approvedByName,
    approvedAt: approvedAt.toISOString(),
  };
}

export async function releaseVisitCompletion(
  noteId: string,
  payload: VisitCompletionReleasePayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();

  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Forbidden: read-only access to notes" };
  }

  const note = await prisma.note.findUnique({
    where: { id: noteId },
    include: { encounter: true },
  });
  if (!note) return { ok: false, error: "Note not found" };

  if (note.status !== "finalized") {
    return { ok: false, error: "This note is not finalized and cannot be completed." };
  }

  // Verify org access
  const encounter = await prisma.encounter.findFirst({
    where: {
      id: note.encounterId,
      organizationId: user.organizationId!,
    },
  });
  if (!encounter) return { ok: false, error: "Unauthorized" };

  // Chart privacy gate
  try {
    await assertChartAccess(user, encounter.patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Forbidden: chart is restricted" };
    }
    throw err;
  }

  if (!payload.canRelease) {
    return { ok: false, error: "Release is blocked; unresolved sections remain." };
  }

  // Idempotency: verify no existing release
  const existing = await prisma.visitCompletion.findUnique({
    where: { noteId },
  });
  if (existing) {
    return { ok: false, error: "Visit completion has already been released." };
  }

  try {
    // Run the release inside a transaction to ensure all side-effects and DB entries land atomically.
    // The VisitCompletion unique noteId insert is intentionally first, so a concurrent release
    // attempt fails before tasks, messages, or audit rows are created.
    await prisma.$transaction(async (tx) => {
      // 1. Create the VisitCompletion record
      await tx.visitCompletion.create({
        data: {
          noteId,
          organizationId: user.organizationId!,
          patientId: encounter.patientId,
          releasedById: user.id,
          payload: payload as any,
        },
      });

      // 2. Suggested Orders: Create a Task for the back-office order queue
      const ordersSection = payload.includedSections.find((s) => s.cardId === "orders");
      if (ordersSection && ordersSection.labels.length > 0) {
        await tx.task.create({
          data: {
            organizationId: user.organizationId!,
            patientId: encounter.patientId,
            title: `Orders: ${ordersSection.labels.join(", ")}`,
            description: `Suggested orders released by physician.\n\nNote: ${
              ordersSection.editNote || ordersSection.confirmationNote || "Approved"
            }`,
            status: "open",
            assigneeRole: "back_office",
          },
        });
      }

      // 3. Follow-Up Plan. One-click booking (audit minor #7): when the
      // physician chose "Book follow-up", create a real pre-filled Appointment
      // (provider + modality + patient carried from this visit) instead of a
      // free-text scheduling task — the appointment is `requested` so the front
      // desk confirms the exact slot. Any other routing (or an unparseable
      // interval) falls back to the front-office scheduling task.
      const followUpSection = payload.includedSections.find((s) => s.cardId === "follow_up");
      if (followUpSection && followUpSection.labels.length > 0) {
        const booking =
          followUpSection.structuredEdit?.followUpRouting === "book_appointment"
            ? deriveFollowUpBooking({
                followUpInterval: followUpSection.structuredEdit.followUpInterval,
                modality: encounter.modality,
                now: new Date(),
              })
            : null;

        if (booking) {
          const appointment = await tx.appointment.create({
            data: {
              patientId: encounter.patientId,
              providerId: encounter.providerId ?? encounter.renderingProviderId ?? undefined,
              startAt: booking.startAt,
              endAt: booking.endAt,
              modality: booking.modality,
              status: "requested",
              notes: "Follow-up booked from visit wrap-up",
            },
          });
          await tx.auditLog.create({
            data: {
              organizationId: user.organizationId!,
              actorUserId: user.id,
              action: "visit_completion.follow_up.booked",
              subjectType: "Appointment",
              subjectId: appointment.id,
              metadata: {
                noteId,
                intervalDays: booking.intervalDays,
                modality: booking.modality,
              } as any,
            },
          });
        } else {
          await tx.task.create({
            data: {
              organizationId: user.organizationId!,
              patientId: encounter.patientId,
              title: `Follow-Up: ${followUpSection.labels.join(", ")}`,
              description: `Follow-up plan released by physician.\n\nNote: ${
                followUpSection.editNote || followUpSection.confirmationNote || "Approved"
              }`,
              status: "open",
              assigneeRole: "front_office",
            },
          });
        }
      }

      // 4. Patient Communication: Create a draft Message to the patient
      const commsSection = payload.includedSections.find((s) => s.cardId === "patient_message");
      if (commsSection && commsSection.labels.length > 0) {
        // EMR-1101 (M6) dedup rule: the visit-completion release is the
        // authoritative post-visit patient message — the Patient Outreach
        // Agent skips when a release exists (see patient-outreach-agent.ts).
        // But that agent fires on encounter.completed, i.e. usually BEFORE
        // the physician reaches this release step. If it already drafted a
        // post-visit message for this patient since the encounter completed,
        // do not stack a second near-identical draft into the same thread /
        // approvals queue; the existing draft remains the single outgoing
        // message awaiting send approval.
        const existingOutreachDraft = await tx.message.findFirst({
          where: {
            thread: { patientId: encounter.patientId },
            aiDrafted: true,
            status: "draft",
            senderAgent: { startsWith: "agent:patientOutreach" },
            createdAt: {
              gte:
                encounter.completedAt ??
                new Date(Date.now() - 24 * 60 * 60 * 1000),
            },
          },
          select: { id: true },
        });
        if (!existingOutreachDraft) {
          const thread = await tx.messageThread.findFirst({
            where: { patientId: encounter.patientId },
            orderBy: { lastMessageAt: "desc" },
          });
          const threadId =
            thread?.id ??
            (
              await tx.messageThread.create({
                data: {
                  patientId: encounter.patientId,
                  subject: "Care Plan & Next Steps",
                  lastMessageAt: new Date(),
                },
              })
            ).id;

          await tx.message.create({
            data: {
              threadId,
              senderUserId: user.id,
              status: "draft",
              body:
                commsSection.editNote ||
                commsSection.confirmationNote ||
                commsSection.labels.join("\n"),
              aiDrafted: true,
              sentAt: null,
            },
          });
        }
      }

      // 5. Create audit log entry (minimize PHI)
      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId!,
          actorUserId: user.id,
          action: "visit_completion.released",
          subjectType: "VisitCompletion",
          subjectId: noteId,
          metadata: {
            totalCards: payload.summary.totalCards,
            includedCards: payload.summary.includedCards,
            heldOutCards: payload.summary.heldOutCards,
            version: payload.version,
          } as any,
        },
      });
    });
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return { ok: false, error: "Visit completion has already been released." };
    }
    throw err;
  }

  await recordVisitCompletionFeedback({
    payload,
    noteId,
    organizationId: user.organizationId!,
    reviewerId: user.id,
  });

  revalidatePath(`/clinic/patients/${encounter.patientId}`);
  return { ok: true };
}

async function recordVisitCompletionFeedback({
  payload,
  noteId,
  organizationId,
  reviewerId,
}: {
  payload: VisitCompletionReleasePayload;
  noteId: string;
  organizationId: string;
  reviewerId: string;
}): Promise<void> {
  if (payload.feedbackSignals.length === 0) {
    return;
  }

  const sections = [
    ...payload.includedSections,
    ...payload.heldOutSections,
    ...payload.unresolvedSections,
  ];

  const settled = await Promise.allSettled(
    payload.feedbackSignals.map((signal) => {
      const section = sections.find((candidate) => candidate.cardId === signal.cardId);

      return recordFeedback({
        agentName: "visitCompletion",
        agentVersion: "1.0.0",
        organizationId,
        noteId,
        action: signal.feedbackAction,
        reviewerId,
        reviewerNote: section
          ? `${section.title}: ${signal.meaning}`
          : signal.meaning,
        editDelta:
          signal.feedbackAction === "approved_with_edits"
            ? section?.editNote ?? section?.confirmationNote ?? null
            : null,
      });
    }),
  );

  if (settled.some((result) => result.status === "rejected")) {
    logger.warn({
      event: "visit_completion.feedback.persist_failed",
      noteId,
      failedCount: settled.filter((result) => result.status === "rejected").length,
    });
  }
}

function isUniqueConstraintError(err: unknown): boolean {
  const code = typeof err === "object" && err !== null && "code" in err ? (err as any).code : null;
  const message =
    typeof err === "object" && err !== null && "message" in err
      ? String((err as any).message)
      : "";

  return code === "P2002" || message.includes("Unique constraint");
}
