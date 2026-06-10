"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { deliverMessage } from "@/lib/messaging/deliver";

const replySchema = z.object({
  threadId: z.string().min(1),
  body: z.string().min(1).max(5000),
});

export type ChartReplyResult = { ok: true } | { ok: false; error: string };

/**
 * Send a reply within a patient chart correspondence thread.
 * Creates a Message with status "sent" and bumps the thread's lastMessageAt.
 */
export async function sendChartReply(
  _prev: ChartReplyResult | null,
  formData: FormData
): Promise<ChartReplyResult> {
  const user = await requireUser();

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

  // Clear any in-progress draft for this thread, then record the reply as a
  // delivered portal message (the patient reads it in their portal).
  await prisma.message.deleteMany({
    where: { threadId: parsed.data.threadId, status: "draft" },
  });
  await deliverMessage({
    threadId: parsed.data.threadId,
    channel: "portal",
    body: parsed.data.body,
    senderUserId: user.id,
  });

  revalidatePath(`/clinic/patients`);
  return { ok: true };
}
