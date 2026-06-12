// Inbound Message Gateway — urgent 911/ED safety auto-reply (EMR-1145,
// closes the dispatch TODO left in messageUrgencyObserver from EMR-1147).
//
// Spec Phase 4.1: the moment a message routes urgent (UPI ≥ 0.75), an
// automated red-flag response goes back on the patient's channel. This
// module is the single dispatcher both channels share:
//
//   - SMS: called synchronously from ingestInboundMessage() — a patient
//     texting "crushing chest pain" must not wait on the agent queue.
//   - Portal: called by the safetyAutoResponder agent on `message.received`
//     (the same event the SMS path dispatches, so the idempotency guard
//     below is what prevents a double reply on the SMS path).
//
// The reply is clearly marked as automated (EMR-784 disclaimer spirit:
// the patient must always know when no human wrote the message), carries
// the agent sender identity, and is audit-logged PHI-safe.

import { prisma } from "@/lib/db/prisma";
import { attemptDelivery } from "@/lib/messaging/deliver";
import { URGENT_AUTO_REPLY } from "@/lib/triage/upi";
import type { InboundChannel } from "./normalize";

export const SAFETY_AUTO_RESPONDER_NAME = "safetyAutoResponder";
export const SAFETY_AUTO_RESPONDER_VERSION = "1.0.0";

/** `Message.senderAgent` value — also the idempotency key for the guard. */
export const SAFETY_AUTO_REPLY_SENDER = `${SAFETY_AUTO_RESPONDER_NAME}:${SAFETY_AUTO_RESPONDER_VERSION}`;

/** Don't send a second safety auto-reply to the same thread within this window. */
export const AUTO_REPLY_DEDUPE_WINDOW_MS = 60 * 60 * 1000;

/**
 * Full auto-reply body: explicit automation disclaimer (EMR-784 spirit —
 * never let an automated message masquerade as the care team) wrapped
 * around the pre-configured 911/ED copy from the UPI engine.
 */
export function buildSafetyAutoReplyBody(): string {
  return (
    "[Automated safety message — no human has read your message yet] " +
    URGENT_AUTO_REPLY
  );
}

export interface SafetyAutoReplyInput {
  threadId: string;
  patientId: string;
  organizationId: string | null;
  channel: InboundChannel;
  /** Patient phone for the SMS channel; ignored for portal. */
  recipientPhone?: string | null;
  /** The inbound message that triaged urgent (audit linkage). */
  triggerMessageId: string;
  /** Final UPI score, recorded in the audit row. */
  upiScore: number;
  /** Who is dispatching — "ingest" (webhook path) or "agent" (portal path). */
  dispatchedBy: "ingest" | "agent";
}

export type SafetyAutoReplyResult =
  | { sent: true; messageId: string; delivery: string }
  | { sent: false; skippedReason: "recent_auto_reply_exists" };

/**
 * Create the automated 911/ED reply in the patient's thread and attempt
 * real external delivery for SMS. Idempotent per thread within
 * AUTO_REPLY_DEDUPE_WINDOW_MS — the `message.received` agent path and the
 * synchronous SMS ingest path can both call this without double-texting
 * a patient who is having an emergency.
 */
export async function dispatchSafetyAutoReply(
  input: SafetyAutoReplyInput,
): Promise<SafetyAutoReplyResult> {
  const now = new Date();

  // Idempotency guard — one safety reply per thread per window.
  const existing = await prisma.message.findFirst({
    where: {
      threadId: input.threadId,
      senderAgent: SAFETY_AUTO_REPLY_SENDER,
      createdAt: { gte: new Date(now.getTime() - AUTO_REPLY_DEDUPE_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (existing) {
    return { sent: false, skippedReason: "recent_auto_reply_exists" };
  }

  const body = buildSafetyAutoReplyBody();
  const recipient = input.channel === "sms" ? input.recipientPhone ?? null : null;

  // Truthful delivery state, reusing the EMR-808 choke point's pure helper:
  // a real Twilio send for SMS, "delivered" for portal (persisting IS
  // delivery in-app), honest "recorded" when no provider is configured.
  const outcome = await attemptDelivery(input.channel, { recipient, body });

  const message = await prisma.message.create({
    data: {
      threadId: input.threadId,
      senderUserId: null,
      senderAgent: SAFETY_AUTO_REPLY_SENDER,
      aiDrafted: false, // deterministic template, not LLM-drafted
      status: "sent",
      channel: input.channel,
      delivery: outcome.delivery,
      deliveryDetail: outcome.detail,
      recipient,
      body,
      sentAt: now,
    },
    select: { id: true },
  });

  await prisma.messageThread.update({
    where: { id: input.threadId },
    data: { lastMessageAt: now },
  });

  // PHI-safe audit: ids, score, delivery state — never the body/recipient.
  await prisma.auditLog.create({
    data: {
      organizationId: input.organizationId ?? undefined,
      actorAgent: `agent:${SAFETY_AUTO_REPLY_SENDER.replace(":", "@")}`,
      action: "message.safety_auto_reply.sent",
      subjectType: "Message",
      subjectId: message.id,
      metadata: {
        threadId: input.threadId,
        patientId: input.patientId,
        triggerMessageId: input.triggerMessageId,
        channel: input.channel,
        delivery: outcome.delivery,
        upiScore: input.upiScore,
        dispatchedBy: input.dispatchedBy,
      },
    },
  });

  return { sent: true, messageId: message.id, delivery: outcome.delivery };
}
