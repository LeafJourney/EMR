import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { triageThread } from "@/lib/domain/smart-inbox";
import { deriveVulnerabilityFlags } from "@/lib/triage/upi";
import { recordObservation } from "@/lib/agents/memory/clinical-observation";

// ---------------------------------------------------------------------------
// Message Urgency Observer
// ---------------------------------------------------------------------------
// Fires on every inbound patient message. Runs the existing triageThread
// heuristic and — if the patient is reporting something urgent or an
// adverse reaction — writes a ClinicalObservation so the signal survives
// past the message thread itself.
//
// Why a separate observation, when MessagesTile already surfaces the
// urgent thread inline? Two reasons:
//
//   1. Threads fade. The moment a patient replies "thanks, feeling
//      better," the red dot clears from the inbox preview. The
//      original urgent signal is gone. An observation is durable —
//      it shows up on Clinical Discovery and Patient Impact until
//      the physician explicitly resolves it.
//
//   2. Different cockpit, different surface. The Patient Impact tile
//      on the Command Center is ranked by unresolved observations,
//      not by inbox recency. An urgent 2am message should be on that
//      ranked list at 9am regardless of whether the patient has
//      replied since.
//
// Runs in parallel with correspondenceNurseAgent (the approval-gated
// response drafter). The two workflows listen to the same event and
// don't interfere.
// ---------------------------------------------------------------------------

const input = z.object({
  messageId: z.string(),
  threadId: z.string(),
  patientId: z.string(),
});

const output = z.object({
  observationWritten: z.boolean(),
  observationId: z.string().nullable(),
  priority: z.string(),
  category: z.string(),
});

export const messageUrgencyObserverAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "messageUrgencyObserver",
  version: "1.0.0",
  description:
    "Triages every inbound patient message and writes a ClinicalObservation " +
    "for urgent keywords (emergent symptoms) or adverse reactions, so the " +
    "signal survives past the message thread and lands on the Command " +
    "Center's Discovery and Impact tiles.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "write.outcome.reminder"],
  requiresApproval: false,

  async run({ messageId, threadId, patientId }, ctx) {
    ctx.assertCan("read.patient");

    // EMR-1147 — chart context feeds the UPI vulnerability multiplier
    // (V_patient): severe cardiovascular disease, advanced metabolic
    // instability, 30-day post-op window.
    const [thread, chart] = await Promise.all([
      prisma.messageThread.findUnique({
        where: { id: threadId },
        include: {
          patient: { select: { userId: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      }),
      prisma.patient.findUnique({
        where: { id: patientId },
        select: {
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
    if (!thread) {
      ctx.log("info", "Thread not found — skipping triage", { threadId });
      return {
        observationWritten: false,
        observationId: null,
        priority: "unknown",
        category: "unknown",
      };
    }

    const vulnerability = deriveVulnerabilityFlags({
      conditions: chart?.pastMedicalConditions ?? [],
      contraindications: chart?.contraindications ?? [],
      surgeries: chart?.pastSurgeries ?? [],
    });

    // EMR-1146 — the deterministic UPI engine inside triageThread is the
    // primary signal (negation/subject-attribution aware); the keyword
    // heuristic is advisory only. Fixes both EMR-1090 failure modes.
    const result = triageThread(
      thread.messages.map((m) => ({
        body: m.body,
        senderUserId: m.senderUserId,
        senderAgent: m.senderAgent,
        createdAt: m.createdAt.toISOString(),
      })),
      thread.patient.userId,
      { vulnerability },
    );

    // Only durable-record the two signal classes a physician actually
    // needs to see on the dashboard. Routine / low gets caught elsewhere
    // (correspondence nurse response drafting, inbox ordering).
    const shouldRecord =
      result.priority === "urgent" ||
      (result.priority === "high" && result.category === "adverse_reaction");

    if (!shouldRecord) {
      ctx.log("info", "Triage below observation threshold", {
        priority: result.priority,
        category: result.category,
      });
      return {
        observationWritten: false,
        observationId: null,
        priority: result.priority,
        category: result.category,
      };
    }

    ctx.assertCan("write.outcome.reminder");

    const severity = result.priority === "urgent" ? "urgent" : "concern";
    const observationCategory =
      result.category === "adverse_reaction" ? "side_effect" : "red_flag";

    // Short, scannable summary for the Discovery tile. The full
    // triage rationale goes in the observation metadata for the
    // physician who clicks through.
    const latestPatientMsg = thread.messages.find(
      (m) =>
        m.senderUserId === thread.patient.userId ||
        (!m.senderUserId && !m.senderAgent),
    );
    const preview = latestPatientMsg
      ? truncate(latestPatientMsg.body, 140)
      : thread.subject;

    const obs = await recordObservation({
      patientId,
      observedBy: "messageUrgencyObserver@1.0.0",
      observedByKind: "agent",
      category: observationCategory,
      severity,
      summary: `Patient message: ${preview}`,
      actionSuggested:
        result.suggestedAction ??
        (result.priority === "urgent"
          ? "Call the patient now — triage surfaced a red-flag keyword."
          : "Review symptoms and consider dose adjustment at next touchpoint."),
      evidence: { messageIds: [messageId] },
      metadata: {
        threadId,
        triagePriority: result.priority,
        triageCategory: result.category,
        triageReason: result.triageReason,
        // EMR-1146 — UPI score + factor breakdown for clinician transparency.
        upiScore: result.upi?.upi ?? null,
        upiRoute: result.upi?.route ?? null,
        upiFactors: result.upi ? JSON.parse(JSON.stringify(result.upi.factors)) : null,
        // TODO(EMR-1147): the pre-configured 911/ED auto-reply
        // (result.upi.autoReply) should be dispatched on the patient's
        // channel by the inbound-message webhook / correspondence workflow.
        // This observer only has read.patient + write.outcome.reminder
        // permissions, so it records the decision but cannot send messages.
        upiAutoReply: result.upi?.autoReply ?? null,
      },
    });

    ctx.log("info", "Urgency observation written", {
      observationId: obs.id,
      priority: result.priority,
    });

    return {
      observationWritten: true,
      observationId: obs.id,
      priority: result.priority,
      category: result.category,
    };
  },
};

export function truncate(s: string, max: number): string {
  const clean = s.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).trimEnd() + "…";
}
