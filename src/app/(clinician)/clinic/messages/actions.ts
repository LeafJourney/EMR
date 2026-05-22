"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

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

// ---------- Compose new patient thread (EMR-658) ----------

const composeSchema = z.object({
  patientId: z.string().min(1),
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
});

export type ComposeResult =
  | { ok: true; threadId: string }
  | { ok: false; error: string };

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
