"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { dispatch } from "@/lib/orchestration/dispatch";
import { logger } from "@/lib/observability/log";
import { deliverMessage } from "@/lib/messaging/deliver";
import {
  ForbiddenError,
  assertChartAccess,
  hasPermission,
  requirePermission,
} from "@/lib/rbac/permissions";
import { encodeSourceRef } from "@/lib/domain/unresolved-followups";
import {
  advanceVisitState,
  assignVisitProvider,
  resolveProviderForUser,
  selectActiveVisitEncounter,
} from "@/lib/domain/visit-state";
import {
  summarizeVisitReadiness,
  type VisitReadiness,
} from "@/lib/clinical/visit-readiness";

/**
 * Start a visit: find or create an in-progress encounter for today,
 * dispatch the scribe draft event, attempt a quick inline run with a
 * timeout, and redirect to notes immediately.
 */
export async function startVisit(patientId: string) {
  const user = await requireUser();

  // EMR-786 — Starting a visit requires write access to clinical notes.
  // Front-office and back-office staff hit the deny path; mid-levels +
  // clinicians + practice_owners pass.
  if (!hasPermission(user, "notes.edit")) {
    redirect(`/clinic/patients/${patientId}?tab=notes&error=unauthorized`);
  }

  // EMR-786 — Chart-privacy gate. A doctor-only chart that the current
  // user is not on the allowlist for must reject the start-visit, even
  // for clinicians who would otherwise have notes.edit globally.
  try {
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      redirect(`/clinic/patients/${patientId}?tab=notes&error=restricted`);
    }
    throw err;
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });
  if (!patient) {
    redirect(`/clinic/patients/${patientId}?tab=notes&error=not_found`);
  }

  // Prefer reusing today's existing active encounter (the
  // patient was booked, checked-in, or roomed) before minting a new one —
  // otherwise the front desk's encounter and the physician's diverge into
  // duplicate encounters and duplicate downstream automation. Selection +
  // transition go through the shared visit-state spine.
  const currentProvider = await resolveProviderForUser(user.id, user.organizationId!);

  let encounter = await selectActiveVisitEncounter(patientId, user.organizationId!);

  if (encounter) {
    // Advance to in-progress FIRST — idempotent, never touches briefingContext —
    // so a reused scheduled encounter is marked "with provider" even when we
    // short-circuit to an already-drafted note below. Otherwise the queue board
    // would still show the patient as waiting while the doc is documenting.
    encounter = (await advanceVisitState(encounter, "in_visit", user.id)).encounter;

    // Record who is rendering this visit without stealing a scheduled
    // encounter's ownership (claims providerId if unset; else renderingProviderId).
    encounter = await assignVisitProvider(encounter, currentProvider?.id ?? null);

    const existingNote = await prisma.note.findFirst({
      where: { encounterId: encounter.id },
      orderBy: { createdAt: "desc" },
    });
    if (existingNote) {
      redirect(`/clinic/patients/${patientId}/notes/${existingNote.id}`);
    }
  } else {
    encounter = await prisma.encounter.create({
      data: {
        organizationId: user.organizationId!,
        patientId,
        status: "in_progress",
        modality: "in_person",
        reason: "Visit",
        startedAt: new Date(),
        scheduledFor: new Date(),
        providerId: currentProvider?.id ?? undefined,
      },
    });
  }

  // Dispatch the scribe event — this enqueues the job
  const jobs = await dispatch({
    name: "encounter.note.draft.requested",
    encounterId: encounter.id,
    requestedBy: user.id,
  });

  // Try to run the agent inline with a 15-second timeout.
  // By running the specific job(s) returned by dispatch, we avoid
  // inadvertently pulling unrelated backlogged jobs from the queue.
  try {
    if (jobs.length > 0) {
      const jobRows = await prisma.agentJob.findMany({ where: { id: { in: jobs } } });
      const { runJob } = await import("@/lib/orchestration/runner");
      
      await Promise.race([
        Promise.all(jobRows.map(job => runJob(job, "inline-visit"))),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), 15000)
        ),
      ]);
    }
  } catch (err) {
    // Timeout or error — the job is still in the queue.
    logger.error({ event: "clinic.start_visit.inline_failed", err });
  }

  // Query for the note the scribe just created (if any) and redirect
  // directly to it. If none exists yet, fall back to the notes tab
  // with a message so the clinician knows the scribe is processing.
  const latestNote = await prisma.note.findFirst({
    where: { encounterId: encounter.id },
    orderBy: { createdAt: "desc" },
  });

  revalidatePath(`/clinic/patients/${patientId}`);

  if (latestNote) {
    redirect(`/clinic/patients/${patientId}/notes/${latestNote.id}`);
  } else {
    redirect(`/clinic/patients/${patientId}?tab=notes&scribe=processing`);
  }
}

/**
 * Rooming / pre-visit readiness handoff for today's encounter. Lets the chart
 * and note-start path show the physician what the front desk and pre-visit
 * surfaces already prepared (intake done, patient confirmed, briefing ready,
 * emoji demeanor) before they start documenting. Read-only; gated by the same
 * baseline chart access as opening the chart.
 */
export async function getVisitReadiness(patientId: string): Promise<VisitReadiness> {
  const user = await requireUser();
  await assertChartAccess(user, patientId);
  const encounter = await selectActiveVisitEncounter(patientId, user.organizationId!);
  return summarizeVisitReadiness(encounter);
}

export async function saveAllergy(patientId: string, drugName: string, reaction: string) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  const newAllergy = `${drugName}:${reaction}`;
  const allergies = [...(patient.allergies || [])];
  if (!allergies.includes(newAllergy)) {
    allergies.push(newAllergy);
  }

  // Editing the allergy list is itself a screening event (EMR-913).
  await prisma.patient.update({
    where: { id: patientId },
    data: { allergies, allergiesScreenedAt: new Date() },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

export async function removeAllergen(patientId: string, allergyStr: string) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  const allergies = (patient.allergies || []).filter((a) => a !== allergyStr);

  await prisma.patient.update({
    where: { id: patientId },
    data: { allergies, allergiesScreenedAt: new Date() },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

/**
 * EMR-913 — record that allergies were affirmatively reviewed without changing
 * the list. This is the "no known drug allergies" / "reviewed, nothing to add"
 * path: it stamps `allergiesScreenedAt` so the pre-visit gate counts the patient
 * as screened even when the allergy array is (correctly) empty — the exact case
 * the old `allergies.length > 0` proxy got wrong.
 */
export async function markAllergiesReviewed(patientId: string) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
    select: { id: true },
  });
  if (!patient) throw new Error("Patient not found");

  await prisma.patient.update({
    where: { id: patientId },
    data: { allergiesScreenedAt: new Date() },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

export async function updatePatientPhoto(patientId: string, base64Data: string) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  const intake = (patient.intakeAnswers as Record<string, any>) ?? {};
  const updatedIntake = { ...intake, photoUrl: base64Data };

  await prisma.patient.update({
    where: { id: patientId },
    data: { intakeAnswers: updatedIntake as any },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  revalidatePath(`/portal/profile`);
  return { ok: true };
}

/**
 * UX inline-edit primitive — single-field demographic update from the
 * chart. Each call writes one column and stamps an AuditLog entry so the
 * change is traceable. Bound writes to RBAC: only users with chart write
 * access (notes.edit) can mutate demographics.
 */
const INLINE_DEMOGRAPHIC_FIELDS = new Set([
  "firstName",
  "lastName",
  "dateOfBirth",
  "email",
  "phone",
  "addressLine1",
  "addressLine2",
  "city",
  "state",
  "postalCode",
] as const);

type InlineDemographicField =
  | "firstName"
  | "lastName"
  | "dateOfBirth"
  | "email"
  | "phone"
  | "addressLine1"
  | "addressLine2"
  | "city"
  | "state"
  | "postalCode";

export type InlineUpdateResult =
  | { ok: true }
  | { ok: false; error: string };

export async function updatePatientDemographicField(
  patientId: string,
  field: InlineDemographicField,
  rawValue: string,
): Promise<InlineUpdateResult> {
  const user = await requireUser();

  if (!INLINE_DEMOGRAPHIC_FIELDS.has(field)) {
    return { ok: false, error: "Unsupported field" };
  }
  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Read-only access to chart" };
  }

  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
    select: { id: true, organizationId: true },
  });
  if (!patient) return { ok: false, error: "Patient not found" };

  try {
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Chart is restricted" };
    }
    throw err;
  }

  const trimmed = rawValue.trim();

  // Per-field validation + coercion.
  let data: Record<string, unknown>;
  if (field === "firstName" || field === "lastName") {
    if (trimmed.length === 0) return { ok: false, error: "Required" };
    if (trimmed.length > 100) return { ok: false, error: "Too long" };
    data = { [field]: trimmed };
  } else if (field === "dateOfBirth") {
    if (!trimmed) {
      data = { dateOfBirth: null };
    } else {
      const d = new Date(trimmed);
      if (Number.isNaN(d.getTime())) return { ok: false, error: "Invalid date" };
      data = { dateOfBirth: d };
    }
  } else if (field === "email") {
    if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return { ok: false, error: "Invalid email" };
    }
    data = { email: trimmed || null };
  } else if (field === "phone") {
    if (trimmed && !/^[0-9 +()\-.]{7,20}$/.test(trimmed)) {
      return { ok: false, error: "Invalid phone" };
    }
    data = { phone: trimmed || null };
  } else {
    // Address fields — free-text, modest length cap.
    if (trimmed.length > 200) return { ok: false, error: "Too long" };
    data = { [field]: trimmed || null };
  }

  await prisma.patient.update({ where: { id: patient.id }, data: data as any });

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "patient.demographics.updated",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: { field } as any,
    },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

/**
 * Update a single field inside the `intakeAnswers.insurance` JSON blob —
 * used by the inline-edit insurance card. Keeps writes off the
 * full-intake JSON read/modify/write pattern that exists elsewhere in
 * this file.
 */
type InlineInsuranceField = "providerName" | "memberId" | "groupNumber";

export async function updatePatientInsuranceField(
  patientId: string,
  field: InlineInsuranceField,
  rawValue: string,
): Promise<InlineUpdateResult> {
  const user = await requireUser();
  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Read-only access to chart" };
  }
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) return { ok: false, error: "Patient not found" };

  try {
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Chart is restricted" };
    }
    throw err;
  }

  const trimmed = rawValue.trim();
  if (trimmed.length > 200) return { ok: false, error: "Too long" };

  const intake = (patient.intakeAnswers as Record<string, any>) ?? {};
  const insurance = (intake.insurance as Record<string, any>) ?? {};
  insurance[field] = trimmed || null;
  intake.insurance = insurance;

  await prisma.patient.update({
    where: { id: patient.id },
    data: { intakeAnswers: intake as any },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "patient.insurance.updated",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: { field } as any,
    },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

/**
 * Inline-edit on an encounter row — title (`reason`) and modality. Both
 * are common on the chart's encounters list. Used by InlineEdit /
 * InlineEditSelect.
 */
type InlineEncounterField = "reason" | "modality";

const ENCOUNTER_MODALITIES = new Set(["in_person", "video", "phone"]);

export async function updateEncounterField(
  encounterId: string,
  field: InlineEncounterField,
  rawValue: string,
): Promise<InlineUpdateResult> {
  const user = await requireUser();
  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Read-only access" };
  }

  const encounter = await prisma.encounter.findFirst({
    where: { id: encounterId, organizationId: user.organizationId! },
    select: { id: true, organizationId: true, patientId: true },
  });
  if (!encounter) return { ok: false, error: "Encounter not found" };

  try {
    await assertChartAccess(user, encounter.patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Chart is restricted" };
    }
    throw err;
  }

  const trimmed = rawValue.trim();
  let data: Record<string, unknown>;
  if (field === "reason") {
    if (trimmed.length > 200) return { ok: false, error: "Too long" };
    data = { reason: trimmed || null };
  } else {
    if (!ENCOUNTER_MODALITIES.has(trimmed)) {
      return { ok: false, error: "Invalid modality" };
    }
    data = { modality: trimmed };
  }

  await prisma.encounter.update({ where: { id: encounter.id }, data: data as any });

  await prisma.auditLog.create({
    data: {
      organizationId: encounter.organizationId,
      actorUserId: user.id,
      action: "encounter.updated",
      subjectType: "Encounter",
      subjectId: encounter.id,
      metadata: { field } as any,
    },
  });

  revalidatePath(`/clinic/patients/${encounter.patientId}`);
  return { ok: true };
}

export async function updatePMHAndPSH(patientId: string, pmh: string[], psh: string[]) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
  });
  if (!patient) throw new Error("Patient not found");

  const intake = (patient.intakeAnswers as Record<string, any>) ?? {};
  const updatedIntake = { ...intake, pastMedicalHistory: pmh, pastSurgicalHistory: psh };

  await prisma.patient.update({
    where: { id: patientId },
    data: { intakeAnswers: updatedIntake as any },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

export type LogCorrespondenceResult = {
  ok: true;
  /** EMR-808 — truthful delivery state: "delivered" | "failed" | "recorded". */
  delivery: "delivered" | "failed" | "recorded";
  /** Human-readable detail (provider id, failure reason, or "Call logged"). */
  detail: string | null;
};

export async function logCorrespondence(
  patientId: string,
  type: "email" | "call",
  subject: string,
  body: string,
  attachments?: { name: string; type: string; size: number; base64: string }[]
): Promise<LogCorrespondenceResult> {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
    select: { id: true, email: true, phone: true },
  });
  if (!patient) throw new Error("Patient not found");

  const now = new Date();

  // Create message thread
  const thread = await prisma.messageThread.create({
    data: {
      patientId,
      subject: type === "call" ? `Phone Call - ${now.toLocaleDateString()}` : subject,
      lastMessageAt: now,
    },
    select: { id: true },
  });

  // Append an attachment manifest to the body (true attachment storage is a
  // separate ticket; this keeps the chart record human-readable).
  let messageBody = body;
  if (attachments && attachments.length > 0) {
    messageBody += "\n\nAttachments:";
    for (const att of attachments) {
      messageBody += `\n- ${att.name} (${Math.round(att.size / 1024)} KB)`;
    }
  }

  // type "email" → attempt a real Resend send; "call" → a recorded call log.
  const result = await deliverMessage({
    threadId: thread.id,
    channel: type === "email" ? "email" : "phone",
    body: messageBody,
    subject,
    senderUserId: user.id,
    recipient: type === "email" ? patient.email : patient.phone,
    organizationId: user.organizationId,
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true, delivery: result.delivery, detail: result.detail };
}

export async function addPastMedicalConditionAction(
  patientId: string,
  condition: string,
  onsetYear?: number | null,
  notes?: string | null
) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
    select: { id: true },
  });
  if (!patient) throw new Error("Patient not found");

  await prisma.pastMedicalCondition.create({
    data: {
      patientId,
      condition,
      onsetYear,
      notes,
      source: "clinician",
    },
  });
  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

export async function deletePastMedicalConditionAction(patientId: string, id: string) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
    select: { id: true },
  });
  if (!patient) throw new Error("Patient not found");

  const res = await prisma.pastMedicalCondition.updateMany({
    where: { id, patientId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (res.count === 0) {
    throw new Error("Medical condition not found");
  }
  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

export async function addPastSurgeryAction(
  patientId: string,
  procedure: string,
  performedDateText?: string | null,
  notes?: string | null
) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
    select: { id: true },
  });
  if (!patient) throw new Error("Patient not found");

  await prisma.pastSurgery.create({
    data: {
      patientId,
      procedure,
      performedDateText,
      notes,
      source: "clinician",
    },
  });
  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

export async function deletePastSurgeryAction(patientId: string, id: string) {
  const user = await requireUser();
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: user.organizationId!, deletedAt: null },
    select: { id: true },
  });
  if (!patient) throw new Error("Patient not found");

  const res = await prisma.pastSurgery.updateMany({
    where: { id, patientId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (res.count === 0) {
    throw new Error("Surgical history item not found");
  }
  revalidatePath(`/clinic/patients/${patientId}`);
  return { ok: true };
}

/* ── EMR-675 — Convert an unresolved follow-up into a Task ─────── */

export type ConvertFollowUpResult =
  | { ok: true; taskId: string }
  | { ok: false; error: string };

/**
 * Convert an unresolved follow-up (from a finalized note or triaged
 * thread) into a chart Task. The `sourceRef` is embedded in the
 * description so the panel auto-hides converted items.
 */
export async function convertFollowUpToTask(input: {
  patientId: string;
  title: string;
  detail?: string;
  sourceRef: string; // e.g. "noteId:abc" or "threadId:xyz"
  dueInDays?: number; // optional clinician-set due date hint
}): Promise<ConvertFollowUpResult> {
  const user = await requireUser();

  // Same gate as note edits — clinicians + mid-levels only.
  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Forbidden: read-only access to chart" };
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: input.patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: { id: true, organizationId: true },
  });
  if (!patient) return { ok: false, error: "Patient not found" };

  try {
    await assertChartAccess(user, input.patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Forbidden: chart is restricted" };
    }
    throw err;
  }

  const title = input.title.trim().slice(0, 200);
  if (title.length < 3) return { ok: false, error: "Title is required" };
  const detail = (input.detail ?? "").trim().slice(0, 500);
  const ref = encodeSourceRef(input.sourceRef.slice(0, 120));

  const dueAt =
    input.dueInDays && input.dueInDays > 0 && input.dueInDays <= 365
      ? new Date(Date.now() + input.dueInDays * 86_400_000)
      : null;

  const task = await prisma.task.create({
    data: {
      organizationId: patient.organizationId,
      patientId: patient.id,
      title,
      description: detail ? `${detail}\n\n${ref}` : ref,
      status: "open",
      assigneeUserId: user.id,
      dueAt,
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "patient.followup.converted_to_task",
      subjectType: "Task",
      subjectId: task.id,
      metadata: {
        patientId: patient.id,
        sourceRef: input.sourceRef,
      } as any,
    },
  });

  revalidatePath(`/clinic/patients/${input.patientId}`);
  return { ok: true, taskId: task.id };
}

/* ── EMR-786 — Chart privacy management ────────────────────────── */

export type ChartPrivacyResult =
  | { ok: true; chartRestricted: boolean }
  | { ok: false; error: string };

/**
 * Toggle the doctor-only flag on a chart and set the allowlist of
 * provider User IDs who may view the restricted chart. Only users with
 * `chart.privacy.manage` (clinician / practice_owner) may call this —
 * patients flag their preference via a different intake path that
 * surfaces a Task for the clinician to acknowledge before the flag is
 * set, so this action is always intentional clinician-side.
 *
 * Writes an AuditLog row per repo rule schema.prisma:6.
 */
export async function updateChartPrivacy(input: {
  patientId: string;
  chartRestricted: boolean;
  restrictedProviderIds: string[];
  reason?: string;
}): Promise<ChartPrivacyResult> {
  const user = await requireUser();

  try {
    requirePermission(user, "chart.privacy.manage");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "FORBIDDEN" };
    }
    throw err;
  }

  const patient = await prisma.patient.findFirst({
    where: {
      id: input.patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!patient) return { ok: false, error: "NOT_FOUND" };

  // Ensure the user setting the restriction is themselves on the
  // allowlist — otherwise they'd lock themselves out on the next page
  // load. (Practice owners bypass via PRIVACY_BYPASS_ROLES, but the
  // explicit allowlist entry keeps the audit trail honest.)
  const allowlist = Array.from(
    new Set(
      input.chartRestricted
        ? [...input.restrictedProviderIds, user.id]
        : input.restrictedProviderIds,
    ),
  );

  await prisma.patient.update({
    where: { id: patient.id },
    data: {
      chartRestricted: input.chartRestricted,
      restrictedProviderIds: allowlist,
      chartRestrictedReason: input.reason ?? null,
      chartRestrictedAt: input.chartRestricted ? new Date() : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: input.chartRestricted
        ? "patient.chart.privacy.restricted"
        : "patient.chart.privacy.opened",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: {
        allowlistSize: allowlist.length,
        reason: input.reason ?? null,
      } as any,
    },
  });

  revalidatePath(`/clinic/patients/${input.patientId}`);
  return { ok: true, chartRestricted: input.chartRestricted };
}
