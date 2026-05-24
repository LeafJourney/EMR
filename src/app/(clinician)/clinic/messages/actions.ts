"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { RESOLVED_SENTINEL } from "./resolve-marker";

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

  // Only clinicians and practice owners can send clinical messages
  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner")) {
    return { ok: false, error: "Unauthorized — clinician role required." };
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

  const now = new Date();

  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId: parsed.data.threadId,
        senderUserId: user.id,
        status: "sent",
        body: parsed.data.body,
        sentAt: now,
      },
    }),
    prisma.messageThread.update({
      where: { id: parsed.data.threadId },
      data: { lastMessageAt: now },
    }),
  ]);

  revalidatePath("/clinic/messages");
  return { ok: true };
}

// ---------- Compose new thread ----------
//
// Two server actions exist because two UIs (with two different auth surfaces)
// both open a fresh patient thread:
//   - composeMessage (EMR-656) is invoked from the New Message modal on
//     /clinic/messages. Open to any signed-in EMR user.
//   - composePatientMessage (EMR-658) is invoked from the Gmail-style docked
//     composer that mounts on a patient chart. Restricted to clinician /
//     practice_owner roles since the compose UI is embedded in the chart.

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

  const now = new Date();

  const thread = await prisma.messageThread.create({
    data: {
      patientId: parsed.data.patientId,
      subject: parsed.data.subject,
      lastMessageAt: now,
      messages: {
        create: {
          senderUserId: user.id,
          status: "sent",
          body: parsed.data.body,
          sentAt: now,
        },
      },
    },
  });

  revalidatePath("/clinic/messages");
  return { ok: true, threadId: thread.id };
}

export async function composePatientMessage(
  _prev: ComposeResult | null,
  formData: FormData,
): Promise<ComposeResult> {
  const user = await requireUser();

  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner")) {
    return { ok: false, error: "Unauthorized — clinician role required." };
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

  const now = new Date();
  const thread = await prisma.messageThread.create({
    data: {
      patientId: parsed.data.patientId,
      subject: parsed.data.subject,
      lastMessageAt: now,
    },
    select: { id: true },
  });

  await prisma.message.create({
    data: {
      threadId: thread.id,
      senderUserId: user.id,
      status: "sent",
      body: parsed.data.body,
      sentAt: now,
    },
  });

  revalidatePath("/clinic/messages");
  return { ok: true, threadId: thread.id };
}

// ---------- Resolve thread (EMR-660) ----------
//
// Marks a thread as clinically dispositioned by inserting a system-authored
// "Resolved" chat bubble. The MessageThread model does not (yet) carry a
// dedicated status column — see the follow-up note in the PR body. Until
// then, the inbox treats the presence of a trailing `[[RESOLVED]]` bubble
// from a clinician as the dispositioned marker, and a subsequent patient
// reply causes the thread to reappear automatically (it lands AFTER the
// resolved bubble, so `lastMessageAt > resolvedBubble.createdAt`).
//
// Body sentinel keeps the wire format auditable for the chart export while
// avoiding a schema migration during this PR. When MessageThread gains a
// real `status` column the action will switch to `prisma.messageThread
// .update({ data: { status: "resolved" } })` and the sentinel becomes a
// human-readable label.

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

  const now = new Date();
  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId: thread.id,
        senderUserId: user.id,
        status: "sent",
        body: `${RESOLVED_SENTINEL} Thread resolved at ${now.toISOString()}`,
        sentAt: now,
      },
    }),
    // Do NOT bump lastMessageAt — that would defeat the "hide until new
    // patient message" filter. Leave lastMessageAt at the previous reply.
  ]);

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

  const now = new Date();

  await prisma.$transaction([
    prisma.message.create({
      data: {
        threadId: parsed.data.threadId,
        senderUserId: user.id,
        status: "sent",
        body: parsed.data.body,
        sentAt: now,
      },
    }),
    prisma.messageThread.update({
      where: { id: parsed.data.threadId },
      data: { lastMessageAt: now },
    }),
  ]);

  revalidatePath("/clinic/messages");
  return { ok: true };
}
