// Inbound Message Gateway — ingest pipeline (EMR-1145, epic EMR-1122).
//
// One funnel for inbound patient messages that do NOT arrive through an
// authenticated portal session (today: the Twilio SMS webhook; tomorrow:
// email, voice transcripts). The pipeline mirrors what the portal send
// path (src/app/(patient)/portal/messages/actions.ts) does for portal
// messages, so the Smart Inbox, correspondenceNurse and
// messageUrgencyObserver agents see SMS messages exactly like portal ones:
//
//   verify sender → persist Message into the patient's MessageThread →
//   dispatch `message.received` → UPI triage → urgent? dispatch the
//   911/ED safety auto-reply on the same channel (spec Phase 4.1).
//
// Unverified senders are NEVER silently dropped: they quarantine into an
// AuditLog dead-letter row (action `message.inbound.quarantined`) that
// preserves the payload for staff follow-up, and no thread is created.

import { prisma } from "@/lib/db/prisma";
import { dispatch } from "@/lib/orchestration/dispatch";
import { deriveVulnerabilityFlags, triageMessage } from "@/lib/triage/upi";
import { dispatchSafetyAutoReply } from "./auto-reply";
import type { NormalizedInboundMessage } from "./normalize";

/** Audit actor for gateway-level rows (quarantine, ingest receipts). */
export const INBOUND_GATEWAY_ACTOR = "agent:inboundGateway@1.0.0";

/** deliveryDetail prefix used as the idempotency key for SMS provider ids. */
export const SMS_INBOUND_DETAIL_PREFIX = "twilio-inbound:";

export type IngestResult =
  | {
      status: "quarantined";
      reason: "unverified_sender" | "unmatched_patient" | "patient_not_found";
      auditLogId: string;
    }
  | { status: "duplicate"; messageId: string }
  | {
      status: "ingested";
      messageId: string;
      threadId: string;
      route: "urgent" | "standard";
      upi: number;
      /** Set when the urgent safety auto-reply was created. */
      autoReplyMessageId: string | null;
    };

export interface IngestOptions {
  /** Extra dead-letter context (e.g. the raw From number) for quarantine rows. */
  quarantineContext?: Record<string, unknown>;
}

/**
 * Dead-letter an inbound message we cannot attribute to a verified patient.
 * The AuditLog row IS the persistence — staff can recover the message from
 * the metadata, so nothing is silently dropped. No thread, no Message row,
 * no agent dispatch: an unverified sender must not be able to inject
 * content into a patient's chart.
 */
async function quarantine(
  input: NormalizedInboundMessage,
  reason: "unverified_sender" | "unmatched_patient" | "patient_not_found",
  context?: Record<string, unknown>,
): Promise<Extract<IngestResult, { status: "quarantined" }>> {
  const row = await prisma.auditLog.create({
    data: {
      actorAgent: INBOUND_GATEWAY_ACTOR,
      action: "message.inbound.quarantined",
      subjectType: "InboundMessage",
      subjectId: input.externalId ?? null,
      metadata: {
        reason,
        channel: input.channel,
        receivedAt: input.receivedAt.toISOString(),
        externalId: input.externalId ?? null,
        // Dead-letter payload: kept so the message is recoverable by staff.
        // The sender is unverified, so this is treated as untrusted input,
        // not chart content.
        rawBody: input.rawBody.slice(0, 2000),
        ...(context ?? {}),
      },
    },
    select: { id: true },
  });
  return { status: "quarantined", reason, auditLogId: row.id };
}

/**
 * Ingest one normalized inbound message. See module header for the pipeline.
 *
 * Mirrors the portal send path's failure philosophy (Constitution Art. VI §1):
 * agent dispatch failures never block the message from landing in the
 * thread — but the safety auto-reply is NOT best-effort fluff; failures
 * there are audit-logged loudly so a missed 911 instruction is visible.
 */
export async function ingestInboundMessage(
  input: NormalizedInboundMessage,
  options?: IngestOptions,
): Promise<IngestResult> {
  // ── 1. Sender verification gate ─────────────────────────────────────
  if (!input.senderVerified || !input.patientId) {
    return quarantine(
      input,
      !input.senderVerified ? "unverified_sender" : "unmatched_patient",
      options?.quarantineContext,
    );
  }

  // ── 2. Idempotency — providers (Twilio) retry webhooks ──────────────
  if (input.channel === "sms" && input.externalId) {
    const dupe = await prisma.message.findFirst({
      where: { deliveryDetail: `${SMS_INBOUND_DETAIL_PREFIX}${input.externalId}` },
      select: { id: true },
    });
    if (dupe) return { status: "duplicate", messageId: dupe.id };
  }

  // ── 3. Load the patient + the chart context the UPI engine needs ────
  const patient = await prisma.patient.findUnique({
    where: { id: input.patientId },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      phone: true,
      contraindications: true,
      pastMedicalConditions: {
        where: { deletedAt: null },
        select: { condition: true },
      },
      pastSurgeries: {
        where: { deletedAt: null },
        select: { createdAt: true },
      },
    },
  });
  if (!patient) {
    return quarantine(input, "patient_not_found", options?.quarantineContext);
  }

  // ── 4. Persist into the existing thread model ───────────────────────
  // Reuse the patient's most recent unresolved thread (an SMS reply is
  // almost always a continuation of the active conversation); start a
  // fresh one otherwise — same shape the portal path creates.
  let thread = await prisma.messageThread.findFirst({
    where: { patientId: patient.id, resolvedAt: null },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true },
  });
  if (!thread) {
    thread = await prisma.messageThread.create({
      data: {
        patientId: patient.id,
        subject:
          input.channel === "sms" ? "Text message from patient" : "Patient message",
        lastMessageAt: input.receivedAt,
      },
      select: { id: true },
    });
  }

  const message = await prisma.message.create({
    data: {
      threadId: thread.id,
      // SMS patients may pre-date their portal account; null senderUserId +
      // null senderAgent still reads as patient-originated everywhere
      // (smart-inbox + observer treat that pair as the patient).
      senderUserId: patient.userId ?? null,
      status: "sent",
      channel: input.channel,
      // `recipient` doubles as the verified sender address on inbound rows.
      recipient: input.channel === "sms" ? patient.phone ?? null : null,
      deliveryDetail:
        input.channel === "sms" && input.externalId
          ? `${SMS_INBOUND_DETAIL_PREFIX}${input.externalId}`
          : null,
      body: input.rawBody,
      sentAt: input.receivedAt,
    },
    select: { id: true },
  });

  await prisma.messageThread.update({
    where: { id: thread.id },
    data: { lastMessageAt: input.receivedAt },
  });

  // ── 5. Dispatch the SAME event the portal path dispatches ───────────
  // correspondenceNurse drafts a reply, messageUrgencyObserver records the
  // durable observation, safetyAutoResponder double-checks the auto-reply.
  // Wrapped in try/catch per Constitution Art. VI §1 — a dead agent queue
  // must not silence a patient.
  try {
    await dispatch({
      name: "message.received",
      messageId: message.id,
      threadId: thread.id,
      patientId: patient.id,
      organizationId: patient.organizationId,
    });
  } catch (err) {
    console.warn("[triage/gateway] failed to dispatch message.received", {
      messageId: message.id,
      threadId: thread.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 6. UPI triage (deterministic, synchronous) ──────────────────────
  // Triage runs on the artifact-stripped but CASE-PRESERVED body: the
  // engine normalizes internally for entity extraction, while the distress
  // scorer reads casing/punctuation as signal (ALL-CAPS panic). Feeding it
  // `normalizedBody` (lowercased) would erase that signal.
  const decision = triageMessage(input.rawBody, {
    vulnerability: deriveVulnerabilityFlags({
      conditions: patient.pastMedicalConditions,
      contraindications: patient.contraindications,
      surgeries: patient.pastSurgeries,
    }),
  });

  // ── 7. Urgent → 911/ED safety auto-reply on the same channel ────────
  // Synchronous on purpose: a patient texting red-flag symptoms gets the
  // 911 instruction now, not when a worker next ticks the queue.
  let autoReplyMessageId: string | null = null;
  if (decision.route === "urgent") {
    try {
      const reply = await dispatchSafetyAutoReply({
        threadId: thread.id,
        patientId: patient.id,
        organizationId: patient.organizationId,
        channel: input.channel,
        recipientPhone: patient.phone,
        triggerMessageId: message.id,
        upiScore: decision.upi,
        dispatchedBy: "ingest",
      });
      if (reply.sent) autoReplyMessageId = reply.messageId;
    } catch (err) {
      // Loud failure: a missed 911 instruction must be visible to staff.
      console.error("[triage/gateway] safety auto-reply dispatch FAILED", {
        messageId: message.id,
        threadId: thread.id,
        error: err instanceof Error ? err.message : String(err),
      });
      await prisma.auditLog
        .create({
          data: {
            organizationId: patient.organizationId,
            actorAgent: INBOUND_GATEWAY_ACTOR,
            action: "message.safety_auto_reply.failed",
            subjectType: "Message",
            subjectId: message.id,
            metadata: {
              threadId: thread.id,
              patientId: patient.id,
              channel: input.channel,
              upiScore: decision.upi,
              error: err instanceof Error ? err.message : String(err),
            },
          },
        })
        .catch(() => undefined);
    }
  }

  return {
    status: "ingested",
    messageId: message.id,
    threadId: thread.id,
    route: decision.route,
    upi: decision.upi,
    autoReplyMessageId,
  };
}
