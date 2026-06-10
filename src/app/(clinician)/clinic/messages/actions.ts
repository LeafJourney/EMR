"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { deliverMessage } from "@/lib/messaging/deliver";
import { sendEmail } from "@/lib/email/resend";
import { getSmsAdapter, normalizePhone } from "@/lib/sms/adapter";
import { dispatch } from "@/lib/orchestration/dispatch";
import { logger } from "@/lib/observability/log";

// ---------- Routine-messaging policy (EMR-1111 / FO-M3) ----------
//
// Routine patient messaging (compose AND reply) is a whole-clinic-floor
// function: front office confirms appointments and answers logistics
// questions just as legitimately as a clinician answers clinical ones.
// Previously compose was ungated while reply was clinician-only — staff
// could *start* conversations they were forbidden to continue. This
// explicit allowlist makes the policy coherent: every clinic-floor role
// can handle routine threads; everything else (patient, kiosk, operator,
// platform roles) is denied. Clinical sign-off surfaces (AI drafts,
// thread resolution) remain clinician/practice_owner-only below, and
// sensitive-content masking (`sensitive_diagnoses.read`) still governs
// what each role sees wherever chart content renders.
const ROUTINE_MESSAGING_ROLES: ReadonlySet<Role> = new Set<Role>([
  "clinician",
  "midlevel",
  "back_office",
  "front_office",
  "practice_owner",
]);

function canHandleRoutineMessaging(user: { roles: Role[] }): boolean {
  return user.roles.some((r) => ROUTINE_MESSAGING_ROLES.has(r));
}

const ROUTINE_MESSAGING_DENIED =
  "Unauthorized — your role can't send patient messages.";

// ---------- Reply to a thread ----------

const replySchema = z.object({
  threadId: z.string().min(1),
  body: z.string().min(1).max(5000),
});

export type ReplyResult = { ok: true } | { ok: false; error: string };

export async function sendClinicReplyAction(
  _prev: ReplyResult | null,
  formData: FormData
): Promise<ReplyResult> {
  const user = await requireUser();

  // EMR-1111 (FO-M3) — routine replies are a clinic-floor function, not
  // clinician-only. See ROUTINE_MESSAGING_ROLES above.
  if (!canHandleRoutineMessaging(user)) {
    return { ok: false, error: ROUTINE_MESSAGING_DENIED };
  }

  const parsed = replySchema.safeParse({
    threadId: formData.get("threadId") as string,
    body: (formData.get("body") as string)?.trim(),
  });

  if (!parsed.success) return { ok: false, error: "Please enter a message." };

  // Verify thread belongs to a patient in this organization
  const thread = await prisma.messageThread.findFirst({
    where: {
      id: parsed.data.threadId,
      patient: { organizationId: user.organizationId! },
    },
  });
  if (!thread) return { ok: false, error: "Thread not found." };

  // Portal secure message — delivered in-app (the patient reads it in their
  // portal). deliverMessage records the channel + truthful delivery state.
  await deliverMessage({
    threadId: parsed.data.threadId,
    channel: "portal",
    body: parsed.data.body,
    senderUserId: user.id,
  });

  revalidatePath("/clinic/messages");
  return { ok: true };
}

// ---------- Request an AI-drafted reply (EMR-1103 audit #14) ----------
//
// Wires the previously-dead Messaging Assistant agent to a real surface. The
// `message.draft.requested` domain event was defined and mapped to the
// messagingAssistant workflow, but nothing ever emitted it — so the agent was
// unreachable. The "Draft with AI" control in the thread view emits it here.
//
// The agent loads the patient's chart + longitudinal memory, drafts an
// approval-gated `draft` Message, and that draft surfaces both inline in this
// thread and in the clinician Approvals inbox for sign-off (it is NEVER sent
// automatically). We best-effort run the enqueued job inline (mirroring
// startVisit) so the draft appears promptly; on timeout the worker finishes it.

const aiDraftSchema = z.object({
  threadId: z.string().min(1),
  intent: z.string().min(1).max(40).optional(),
});

export type AiDraftResult = { ok: true } | { ok: false; error: string };

export async function requestAiDraftAction(
  threadId: string,
  intent: string = "follow_up",
): Promise<AiDraftResult> {
  const user = await requireUser();

  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner")) {
    return { ok: false, error: "Unauthorized — clinician role required." };
  }

  const parsed = aiDraftSchema.safeParse({ threadId, intent });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: parsed.data.threadId,
      patient: { organizationId: user.organizationId! },
    },
    select: { patient: { select: { id: true } } },
  });
  if (!thread) return { ok: false, error: "Thread not found." };

  const jobs = await dispatch({
    name: "message.draft.requested",
    patientId: thread.patient.id,
    intent: parsed.data.intent ?? "follow_up",
    organizationId: user.organizationId!,
  });

  // Best-effort inline run so the draft shows up without waiting on the worker.
  try {
    if (jobs.length > 0) {
      const jobRows = await prisma.agentJob.findMany({ where: { id: { in: jobs } } });
      const { runJob } = await import("@/lib/orchestration/runner");
      await Promise.race([
        Promise.all(jobRows.map((job) => runJob(job, "inline-message-draft"))),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 15000)),
      ]);
    }
  } catch (err) {
    // Timeout or error — the job stays queued for the worker to finish.
    logger.error({ event: "clinic.messages.ai_draft.inline_failed", err });
  }

  revalidatePath("/clinic/messages");
  return { ok: true };
}

// ---------- Compose new thread ----------
//
// Two server actions exist because two UIs (with two different auth surfaces)
// both open a fresh patient thread:
//   - composeMessage (EMR-656) is invoked from the New Message modal on
//     /clinic/messages.
//   - composePatientMessage (EMR-658) is invoked from the Gmail-style docked
//     composer that mounts on a patient chart.
// Both are gated by ROUTINE_MESSAGING_ROLES (EMR-1111 / FO-M3).

const composeSchema = z.object({
  patientId: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

export type ComposeResult =
  | { ok: true; threadId: string }
  | { ok: false; error: string };

export async function composeMessage(
  _prev: ComposeResult | null,
  formData: FormData
): Promise<ComposeResult> {
  const user = await requireUser();

  // EMR-1111 (FO-M3) — was ungated; now the explicit routine-messaging
  // allowlist (any authenticated user could previously open a thread).
  if (!canHandleRoutineMessaging(user)) {
    return { ok: false, error: ROUTINE_MESSAGING_DENIED };
  }

  const parsed = composeSchema.safeParse({
    patientId: formData.get("patientId") as string,
    subject: (formData.get("subject") as string)?.trim(),
    body: (formData.get("body") as string)?.trim(),
  });

  if (!parsed.success) {
    return { ok: false, error: "All fields are required." };
  }

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, organizationId: user.organizationId! },
    select: { id: true },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  const thread = await prisma.messageThread.create({
    data: {
      patientId: parsed.data.patientId,
      subject: parsed.data.subject,
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });

  await deliverMessage({
    threadId: thread.id,
    channel: "portal",
    body: parsed.data.body,
    senderUserId: user.id,
  });

  revalidatePath("/clinic/messages");
  return { ok: true, threadId: thread.id };
}

export async function composePatientMessage(
  _prev: ComposeResult | null,
  formData: FormData,
): Promise<ComposeResult> {
  const user = await requireUser();

  // EMR-1111 (FO-M3) — same routine-messaging allowlist as composeMessage;
  // the docked chart composer is no longer clinician-only.
  if (!canHandleRoutineMessaging(user)) {
    return { ok: false, error: ROUTINE_MESSAGING_DENIED };
  }

  const parsed = composeSchema.safeParse({
    patientId: formData.get("patientId") as string,
    subject: (formData.get("subject") as string)?.trim(),
    body: (formData.get("body") as string)?.trim(),
  });

  if (!parsed.success) return { ok: false, error: "Please complete all fields." };

  const patient = await prisma.patient.findFirst({
    where: { id: parsed.data.patientId, organizationId: user.organizationId! },
    select: { id: true },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  const thread = await prisma.messageThread.create({
    data: {
      patientId: parsed.data.patientId,
      subject: parsed.data.subject,
      lastMessageAt: new Date(),
    },
    select: { id: true },
  });

  await deliverMessage({
    threadId: thread.id,
    channel: "portal",
    body: parsed.data.body,
    senderUserId: user.id,
  });

  revalidatePath("/clinic/messages");
  return { ok: true, threadId: thread.id };
}

// ---------- Resolve thread (EMR-660, EMR-808) ----------
//
// Marks a thread as clinically dispositioned via a durable `resolvedAt` column.
// The inbox treats a thread as resolved when `resolvedAt >= lastMessageAt`; a
// subsequent patient reply bumps lastMessageAt past resolvedAt and the thread
// re-opens automatically. (Pre-EMR-808 this was faked with a `[[RESOLVED]]`
// body sentinel; the migration backfilled resolvedAt from those bubbles.)

const resolveSchema = z.object({ threadId: z.string().min(1) });

export type ResolveResult = { ok: true } | { ok: false; error: string };

export async function resolveThread(
  _prev: ResolveResult | null,
  formData: FormData,
): Promise<ResolveResult> {
  const user = await requireUser();

  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner")) {
    return { ok: false, error: "Unauthorized — clinician role required." };
  }

  const parsed = resolveSchema.safeParse({
    threadId: formData.get("threadId") as string,
  });
  if (!parsed.success) return { ok: false, error: "Invalid thread." };

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: parsed.data.threadId,
      patient: { organizationId: user.organizationId! },
    },
    select: { id: true },
  });
  if (!thread) return { ok: false, error: "Thread not found." };

  // Set resolvedAt to now. Do NOT bump lastMessageAt — resolved stays true
  // until a newer patient message lands (lastMessageAt > resolvedAt).
  await prisma.messageThread.update({
    where: { id: thread.id },
    data: { resolvedAt: new Date(), resolvedById: user.id },
  });

  revalidatePath("/clinic/messages");
  return { ok: true };
}

// ---------- Send reply (Smart Inbox — EMR-153) ----------

const sendReplySchema = z.object({
  threadId: z.string().min(1),
  body: z.string().min(1).max(5000),
});

export async function sendReply(
  _prev: ReplyResult | null,
  formData: FormData
): Promise<ReplyResult> {
  const user = await requireUser();

  // EMR-1111 (FO-M3) — was ungated; same routine-messaging allowlist as
  // sendClinicReplyAction (this is the Smart Inbox reply path).
  if (!canHandleRoutineMessaging(user)) {
    return { ok: false, error: ROUTINE_MESSAGING_DENIED };
  }

  const parsed = sendReplySchema.safeParse({
    threadId: formData.get("threadId") as string,
    body: (formData.get("body") as string)?.trim(),
  });

  if (!parsed.success) return { ok: false, error: "Please enter a message." };

  // Verify thread belongs to a patient in this organization
  const thread = await prisma.messageThread.findFirst({
    where: {
      id: parsed.data.threadId,
      patient: { organizationId: user.organizationId! },
    },
  });
  if (!thread) return { ok: false, error: "Thread not found." };

  await deliverMessage({
    threadId: parsed.data.threadId,
    channel: "portal",
    body: parsed.data.body,
    senderUserId: user.id,
  });

  revalidatePath("/clinic/messages");
  return { ok: true };
}

// ---------- Mark a thread read (EMR-808) ----------
//
// Persists read state so it survives a refresh: flips inbound patient messages
// (not authored by this clinician, not agent drafts) to status "read". The
// inbox's unreadCount derives from `status !== "read"`, so persisting here is
// what makes the unread badge stick.

const markReadSchema = z.object({ threadId: z.string().min(1) });

export async function markThreadRead(threadId: string): Promise<void> {
  const user = await requireUser();
  const parsed = markReadSchema.safeParse({ threadId });
  if (!parsed.success) return;

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: parsed.data.threadId,
      patient: { organizationId: user.organizationId! },
    },
    select: { id: true },
  });
  if (!thread) return;

  await prisma.message.updateMany({
    where: {
      threadId: parsed.data.threadId,
      status: { not: "read" },
      senderUserId: { not: user.id },
      senderAgent: null,
    },
    data: { status: "read" },
  });

  revalidatePath("/clinic/messages");
}

// ---------- Export a thread to an external channel (EMR-808) ----------
//
// Replaces the old window.alert("Queued … EMR-664") fake. Performs a REAL send
// for email/text (Resend / Twilio, honest dev fallback), records a PHI-safe
// AuditLog so the export is durable + auditable, and returns the truthful
// outcome for the modal to display. Fax has no adapter → recorded only.

const exportSchema = z.object({
  threadId: z.string().min(1),
  channel: z.enum(["email", "text", "fax"]),
  destination: z.string().min(1).max(200),
  from: z.string().optional(), // YYYY-MM-DD
  to: z.string().optional(),
});

export type ExportThreadResult =
  | { ok: true; delivery: "delivered" | "recorded" | "failed"; detail: string; count: number }
  | { ok: false; error: string };

export async function exportThread(input: {
  threadId: string;
  channel: "email" | "text" | "fax";
  destination: string;
  from?: string;
  to?: string;
}): Promise<ExportThreadResult> {
  const user = await requireUser();

  const parsed = exportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a destination for this channel." };

  const thread = await prisma.messageThread.findFirst({
    where: {
      id: parsed.data.threadId,
      patient: { organizationId: user.organizationId! },
    },
    include: {
      patient: { select: { firstName: true, lastName: true } },
      messages: { orderBy: { createdAt: "asc" }, select: { body: true, createdAt: true } },
    },
  });
  if (!thread) return { ok: false, error: "Thread not found." };

  const from = parsed.data.from ?? "0000-00-00";
  const to = parsed.data.to ?? "9999-99-99";
  const inRange = thread.messages.filter((m) => {
    const d = m.createdAt.toISOString().slice(0, 10);
    return d >= from && d <= to;
  });
  if (inRange.length === 0) return { ok: false, error: "No messages in the selected date range." };

  const patientName = `${thread.patient.firstName} ${thread.patient.lastName}`;
  const transcript = inRange
    .map((m) => `[${m.createdAt.toISOString().slice(0, 16).replace("T", " ")}] ${m.body}`)
    .join("\n\n");

  let delivery: "delivered" | "recorded" | "failed" = "recorded";
  let detail = "";

  if (parsed.data.channel === "email") {
    const res = await sendEmail({
      to: [parsed.data.destination.trim()],
      subject: `Correspondence with ${patientName}: ${thread.subject}`,
      text: transcript,
    });
    if (res.ok) {
      delivery = "delivered";
      detail = `Emailed ${inRange.length} message(s) to ${parsed.data.destination}.`;
    } else if (res.reason === "no-api-key") {
      delivery = "recorded";
      detail = "Email not delivered — no mail provider configured. Export recorded only.";
    } else {
      delivery = "failed";
      detail = `Email export failed: ${res.message}`;
    }
  } else if (parsed.data.channel === "text") {
    const to = normalizePhone(parsed.data.destination);
    if (!to) return { ok: false, error: "Enter a valid phone number." };
    // Never text PHI — send a portal-login notice, not the transcript.
    const res = await getSmsAdapter().send({
      to,
      body: `Your care team shared correspondence with you. Log in to your patient portal to view it securely.`,
    });
    if (!res.ok) {
      delivery = "failed";
      detail = `Text export failed: ${res.error ?? "unknown error"}`;
    } else if (res.adapter === "mock") {
      delivery = "recorded";
      detail = "Simulated — no SMS provider configured. Export recorded only.";
    } else {
      delivery = "delivered";
      detail = `Texted a secure portal notice to ${parsed.data.destination}.`;
    }
  } else {
    // fax — no adapter wired.
    delivery = "recorded";
    detail = "Fax delivery isn't configured — export recorded only.";
  }

  // Durable, PHI-safe audit row (channel/delivery/count only — no destination
  // or body).
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId ?? null,
      actorUserId: user.id,
      action: `message.export.${parsed.data.channel}.${delivery}`,
      subjectType: "MessageThread",
      subjectId: thread.id,
      metadata: { channel: parsed.data.channel, delivery, count: inRange.length },
    },
  });

  return { ok: true, delivery, detail, count: inRange.length };
}
