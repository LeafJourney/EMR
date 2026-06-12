import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { deriveVulnerabilityFlags, triageMessage } from "@/lib/triage/upi";
import {
  dispatchSafetyAutoReply,
  SAFETY_AUTO_RESPONDER_NAME,
  SAFETY_AUTO_RESPONDER_VERSION,
} from "@/lib/triage/gateway/auto-reply";

// ---------------------------------------------------------------------------
// Safety Auto-Responder (EMR-1145, spec Phase 4.1)
// ---------------------------------------------------------------------------
// Fires on every `message.received` and closes the loop the UPI engine
// (EMR-1146/1147) left open: when an inbound patient message routes
// URGENT (UPI ≥ 0.75), the pre-configured 911/ED safety reply is actually
// SENT on the patient's channel — clearly marked automated, audit-logged.
//
// Why a dedicated agent instead of widening messageUrgencyObserver?
// Permissions. The observer deliberately holds only read.patient +
// write.outcome.reminder (it records, it never speaks). Sending — even a
// fixed safety template — is a different power, so it lives in its own
// agent with the explicit `write.message.send` action. This agent NEVER
// composes text: the body is the deterministic URGENT_AUTO_REPLY template,
// which is why it is not approval-gated (there is nothing to review, and
// holding a 911 instruction in an approval queue defeats its purpose).
//
// Channels:
//   - portal: this agent IS the dispatch path (the portal send action only
//     emits `message.received`; nothing else replies automatically).
//   - sms: ingestInboundMessage() already replied synchronously; the
//     dedupe guard inside dispatchSafetyAutoReply makes this run a no-op.
// ---------------------------------------------------------------------------

const input = z.object({
  messageId: z.string(),
  threadId: z.string(),
  patientId: z.string(),
});

const output = z.object({
  route: z.enum(["urgent", "standard"]),
  upi: z.number(),
  autoReplySent: z.boolean(),
  autoReplyMessageId: z.string().nullable(),
  skippedReason: z.string().nullable(),
});

export const safetyAutoResponderAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: SAFETY_AUTO_RESPONDER_NAME,
  version: SAFETY_AUTO_RESPONDER_VERSION,
  description:
    "Re-runs the deterministic UPI triage on every inbound patient message " +
    "and, on an urgent route (UPI ≥ 0.75), sends the pre-configured 911/ED " +
    "safety auto-reply on the patient's channel. Fixed template only — " +
    "never composes text.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "write.message.send"],
  requiresApproval: false,

  async run({ messageId, threadId, patientId }, ctx) {
    ctx.assertCan("read.patient");

    const skip = (reason: string) =>
      ({
        route: "standard" as const,
        upi: 0,
        autoReplySent: false,
        autoReplyMessageId: null,
        skippedReason: reason,
      });

    const [message, patient] = await Promise.all([
      prisma.message.findUnique({
        where: { id: messageId },
        select: {
          id: true,
          threadId: true,
          body: true,
          channel: true,
          senderAgent: true,
          status: true,
        },
      }),
      prisma.patient.findUnique({
        where: { id: patientId },
        select: {
          id: true,
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
      }),
    ]);

    if (!message || message.threadId !== threadId) return skip("message_not_found");
    if (!patient) return skip("patient_not_found");
    // Only patient-originated, sent messages trigger a safety reply —
    // never agent drafts or clinician replies.
    if (message.senderAgent || message.status !== "sent") {
      return skip("not_patient_originated");
    }

    // Raw body on purpose: triageMessage normalizes internally for entity
    // extraction, and the distress scorer needs the original casing.
    const decision = triageMessage(message.body, {
      vulnerability: deriveVulnerabilityFlags({
        conditions: patient.pastMedicalConditions,
        contraindications: patient.contraindications,
        surgeries: patient.pastSurgeries,
      }),
    });

    if (decision.route !== "urgent") {
      ctx.log("info", "Message below urgent threshold — no auto-reply", {
        upi: decision.upi,
      });
      return {
        route: decision.route,
        upi: decision.upi,
        autoReplySent: false,
        autoReplyMessageId: null,
        skippedReason: null,
      };
    }

    ctx.assertCan("write.message.send");

    const reply = await dispatchSafetyAutoReply({
      threadId,
      patientId,
      organizationId: patient.organizationId,
      channel: message.channel === "sms" ? "sms" : "portal",
      recipientPhone: patient.phone,
      triggerMessageId: message.id,
      upiScore: decision.upi,
      dispatchedBy: "agent",
    });

    ctx.log("info", reply.sent ? "Safety auto-reply sent" : "Safety auto-reply skipped", {
      upi: decision.upi,
      ...(reply.sent
        ? { autoReplyMessageId: reply.messageId, delivery: reply.delivery }
        : { skippedReason: reply.skippedReason }),
    });

    return {
      route: "urgent",
      upi: decision.upi,
      autoReplySent: reply.sent,
      autoReplyMessageId: reply.sent ? reply.messageId : null,
      skippedReason: reply.sent ? null : reply.skippedReason,
    };
  },
};
