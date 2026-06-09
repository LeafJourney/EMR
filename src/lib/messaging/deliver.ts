// EMR-808 — single choke-point for outbound clinician messages.
//
// Every "send" in the EMR routes through here so the persisted record is
// TRUTHFUL about what actually happened. We attempt real external delivery
// for email/sms via the existing adapters, then record a durable
// `MessageDelivery` state:
//
//   delivered — portal in-app message (patient reads it in their portal) OR an
//               external provider (Resend/Twilio) returned ok.
//   failed    — an external send was attempted and the provider/network errored;
//               stays visible + retryable.
//   recorded  — internal record only, nothing transmitted externally: a call
//               log, fax (no adapter), or the honest no-provider / dev-mock
//               fallback. The UI must NOT claim external delivery for these.
//
// Reuses sendEmail (@/lib/email/resend) and getSmsAdapter (@/lib/sms/adapter).

import { prisma } from "@/lib/db/prisma";
import { sendEmail } from "@/lib/email/resend";
import { getSmsAdapter, normalizePhone } from "@/lib/sms/adapter";
import type { MessageChannel, MessageDelivery } from "@prisma/client";

export interface DeliverInput {
  threadId: string;
  channel: MessageChannel;
  body: string;
  senderUserId?: string | null;
  /** Email address or phone number for external channels. Null for portal. */
  recipient?: string | null;
  /** Email subject (email channel only). */
  subject?: string;
  /** Owning org, for the PHI-safe audit row on external channels. */
  organizationId?: string | null;
  /** Whether to bump the thread's lastMessageAt. Default true. */
  bumpThread?: boolean;
}

export interface DeliveryOutcome {
  delivery: MessageDelivery;
  /** Provider id (opaque) OR a human-readable reason for recorded/failed. */
  detail: string | null;
  adapter?: "twilio" | "mock";
}

/**
 * Decide the truthful delivery state for a message, performing the real
 * external send for email/sms. No DB writes — unit-testable in isolation.
 */
export async function attemptDelivery(
  channel: MessageChannel,
  opts: { recipient?: string | null; subject?: string; body: string },
): Promise<DeliveryOutcome> {
  switch (channel) {
    case "portal":
      // Persisting a portal message IS delivery — the patient reads it in-app
      // (portal/messages renders clinician replies into the thread).
      return { delivery: "delivered", detail: null };

    case "email": {
      const to = opts.recipient?.trim();
      if (!to) {
        return { delivery: "recorded", detail: "No recipient email on file — recorded only." };
      }
      const res = await sendEmail({
        to: [to],
        subject: opts.subject?.trim() || "A message from your care team",
        text: opts.body,
      });
      if (res.ok) return { delivery: "delivered", detail: `resend:${res.id}` };
      if (res.reason === "no-api-key") {
        return { delivery: "recorded", detail: "Email not delivered — no mail provider configured." };
      }
      return { delivery: "failed", detail: `Email send failed: ${res.message}` };
    }

    case "sms": {
      const to = normalizePhone(opts.recipient);
      if (!to) {
        return { delivery: "recorded", detail: "No valid phone number on file — recorded only." };
      }
      const res = await getSmsAdapter().send({ to, body: opts.body });
      if (!res.ok) {
        return { delivery: "failed", detail: `SMS send failed: ${res.error ?? "unknown error"}`, adapter: res.adapter };
      }
      if (res.adapter === "mock") {
        // A mock send is not a real delivery — be honest about it.
        return { delivery: "recorded", detail: "Simulated — no SMS provider configured.", adapter: "mock" };
      }
      return { delivery: "delivered", detail: `twilio:${res.messageId}`, adapter: "twilio" };
    }

    case "fax":
      return { delivery: "recorded", detail: "Fax delivery not configured — recorded only." };

    case "phone":
      // A "phone" message is a log of a call that already happened, not a send.
      return { delivery: "recorded", detail: "Call logged." };

    default:
      return { delivery: "recorded", detail: null };
  }
}

export interface DeliverResult {
  messageId: string;
  delivery: MessageDelivery;
  detail: string | null;
  adapter?: "twilio" | "mock";
}

/**
 * Record an outbound message with a truthful delivery state, attempting real
 * external delivery first for email/sms. Callers are responsible for
 * authorization (verifying the thread belongs to the org) before calling.
 */
export async function deliverMessage(input: DeliverInput): Promise<DeliverResult> {
  const outcome = await attemptDelivery(input.channel, {
    recipient: input.recipient,
    subject: input.subject,
    body: input.body,
  });

  const now = new Date();
  const message = await prisma.message.create({
    data: {
      threadId: input.threadId,
      senderUserId: input.senderUserId ?? null,
      status: "sent",
      channel: input.channel,
      delivery: outcome.delivery,
      deliveryDetail: outcome.detail,
      recipient: input.recipient ?? null,
      body: input.body,
      sentAt: now,
    },
    select: { id: true },
  });

  if (input.bumpThread !== false) {
    await prisma.messageThread.update({
      where: { id: input.threadId },
      data: { lastMessageAt: now },
    });
  }

  // Audit external channels — PHI-safe: opaque ids/counts only, never body or
  // recipient (mirrors the send-reminders.ts audit pattern).
  if (input.channel === "email" || input.channel === "sms" || input.channel === "fax") {
    await prisma.auditLog.create({
      data: {
        organizationId: input.organizationId ?? null,
        actorUserId: input.senderUserId ?? null,
        action: `message.${input.channel}.${outcome.delivery}`,
        subjectType: "Message",
        subjectId: message.id,
        metadata: {
          channel: input.channel,
          delivery: outcome.delivery,
          adapter: outcome.adapter ?? null,
        },
      },
    });
  }

  return {
    messageId: message.id,
    delivery: outcome.delivery,
    detail: outcome.detail,
    adapter: outcome.adapter,
  };
}
