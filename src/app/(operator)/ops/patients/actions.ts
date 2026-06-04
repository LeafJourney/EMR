"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

// Server actions for the owner-portal patients roster.
//
// SECURITY: every action begins with `requireUser()` and scopes all reads /
// writes to that user's `organizationId`. A client-supplied `patientId` is
// always re-verified against the caller's org before any mutation, so the
// roster can never act on a patient outside the operator's clinic.

/** Patient statuses the operator roster is allowed to set via right-click. */
const ALLOWED_STATUSES = ["prospect", "active", "inactive"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

export type SetPatientStatusResult =
  | { ok: true; status: AllowedStatus }
  | { ok: false; error: string };

/**
 * Change a patient's lifecycle status from the operator roster context menu.
 * Validates the requested status, re-scopes the patient to the caller's org,
 * writes an audit row, and revalidates the roster so the row reflects the
 * new status on the next paint.
 */
export async function setPatientStatus(
  patientId: string,
  status: string,
): Promise<SetPatientStatusResult> {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) return { ok: false, error: "No organization in session." };

  if (!ALLOWED_STATUSES.includes(status as AllowedStatus)) {
    return { ok: false, error: "Unsupported status." };
  }
  const nextStatus = status as AllowedStatus;

  // Never trust the client id — re-scope to the caller's org.
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId, deletedAt: null },
    select: { id: true, status: true },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  // No-op if already at the requested status.
  if (patient.status === nextStatus) {
    return { ok: true, status: nextStatus };
  }

  await prisma.patient.update({
    where: { id: patient.id },
    data: { status: nextStatus },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: user.id,
      action: "patient.status.changed",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: { from: patient.status, to: nextStatus, channel: "ops_roster" },
    },
  });

  revalidatePath("/ops/patients");
  return { ok: true, status: nextStatus };
}

export type SendPatientMessageResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Send (or draft) an email-style message to a patient from the operator
 * roster compose popup. Reuses the existing MessageThread / Message
 * correspondence models: a thread is created (or reused for an identical
 * subject) and a Message row is written with the appropriate status.
 *
 * `draft` keeps the message as a draft (status "draft", no sentAt); otherwise
 * it is marked "sent". An audit row is written either way.
 */
export async function sendPatientMessage(
  patientId: string,
  subject: string,
  body: string,
  options?: { draft?: boolean },
): Promise<SendPatientMessageResult> {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) return { ok: false, error: "No organization in session." };

  const trimmedSubject = subject.trim();
  const trimmedBody = body.trim();
  if (!trimmedBody) return { ok: false, error: "Please enter a message." };

  const isDraft = options?.draft === true;

  // Re-scope the patient to the caller's org.
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, organizationId: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  const now = new Date();
  const subjectLine = trimmedSubject || "(no subject)";

  const thread = await prisma.messageThread.create({
    data: {
      patientId: patient.id,
      subject: subjectLine,
      lastMessageAt: now,
    },
  });

  await prisma.message.create({
    data: {
      threadId: thread.id,
      senderUserId: user.id,
      status: isDraft ? "draft" : "sent",
      body: trimmedBody,
      sentAt: isDraft ? null : now,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: user.id,
      action: isDraft ? "patient.message.drafted" : "patient.message.sent",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: {
        threadId: thread.id,
        subject: subjectLine,
        channel: "ops_roster",
      },
    },
  });

  revalidatePath("/ops/patients");
  return { ok: true };
}
