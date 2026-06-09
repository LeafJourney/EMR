import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { resolvePayerRule } from "@/lib/billing/payer-rules";

// ---------------------------------------------------------------------------
// Stale Claim Monitor Agent
// ---------------------------------------------------------------------------
// The blind spot no other agent covers: a claim can be successfully
// handed to the clearinghouse and then sit in "submitted" for weeks
// without producing a 277CA, a denial, or a payment. The previous
// fleet had no one watching for that silence.
//
// This agent walks the active claim book every day and flags:
//   - submitted > ackSlaDays with no 277CA → ack timeout
//   - accepted > adjudicationSlaDays with no ERA → adjudication timeout
//   - approaching timelyFilingDeadline (< 14d remaining) → write a
//     refile task before the window closes
//
// Each finding becomes a Task + human.review.required event with a
// concrete next step. The payer-rules registry drives the thresholds,
// so govt payers (30-day ack) and commercial payers (2-day ack) are
// judged against their own SLAs.
// ---------------------------------------------------------------------------

const input = z.object({ organizationId: z.string() });

const output = z.object({
  organizationId: z.string(),
  claimsChecked: z.number(),
  ackTimeoutCount: z.number(),
  adjudicationTimeoutCount: z.number(),
  timelyFilingWarnings: z.number(),
  findings: z.array(
    z.object({
      claimId: z.string(),
      claimNumber: z.string().nullable(),
      payerName: z.string().nullable(),
      category: z.enum([
        "ack_timeout",
        "adjudication_timeout",
        "timely_filing_warning",
      ]),
      daysWaited: z.number(),
      slaDays: z.number(),
      recommendedAction: z.string(),
      taskId: z.string().nullable(),
    }),
  ),
});

export const staleClaimMonitorAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "staleClaimMonitor",
  version: "1.0.0",
  description:
    "Walks the active claim book and flags claims that are past their " +
    "per-payer ack or adjudication SLA, or approaching the timely-filing " +
    "deadline. Nothing else in the fleet watches for silence — this closes " +
    "that gap.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.claim", "write.task"],
  requiresApproval: false,

  async run({ organizationId }, ctx) {
    ctx.assertCan("read.claim");
    const now = new Date();

    // Pull claims that are in-flight — submitted / accepted / adjudicated
    // (an adjudicated claim without a posted payment is a different
    // blind spot we want to catch too).
    const candidates = await prisma.claim.findMany({
      where: {
        organizationId,
        status: { in: ["submitted", "accepted", "adjudicated"] },
      },
      include: {
        submissions: { orderBy: { submittedAt: "desc" }, take: 1 },
        adjudications: { orderBy: { parsedAt: "desc" }, take: 1 },
      },
    });

    const findings: Array<{
      claimId: string;
      claimNumber: string | null;
      payerName: string | null;
      category: "ack_timeout" | "adjudication_timeout" | "timely_filing_warning";
      daysWaited: number;
      slaDays: number;
      recommendedAction: string;
      taskId: string | null;
    }> = [];

    let ackTimeoutCount = 0;
    let adjudicationTimeoutCount = 0;
    let timelyFilingWarnings = 0;

    for (const claim of candidates) {
      const rule = resolvePayerRule({
        payerId: claim.payerId,
        payerName: claim.payerName,
      });

      // ── Case 1: submitted, no 277CA accepted within ackSlaDays ──
      if (claim.status === "submitted") {
        const sub = claim.submissions[0];
        const submittedAt = sub?.submittedAt ?? claim.submittedAt;
        if (submittedAt) {
          const daysWaited = Math.floor(
            (now.getTime() - submittedAt.getTime()) / 86_400_000,
          );
          if (daysWaited > rule.ackSlaDays) {
            findings.push({
              claimId: claim.id,
              claimNumber: claim.claimNumber,
              payerName: claim.payerName,
              category: "ack_timeout",
              daysWaited,
              slaDays: rule.ackSlaDays,
              recommendedAction: `Call the clearinghouse for a 277CA status trace. ${rule.displayName}'s ack SLA is ${rule.ackSlaDays} day(s); this claim has been silent for ${daysWaited}. A missing 277CA often means the 837P never reached the payer.`,
              taskId: null,
            });
            ackTimeoutCount++;
          }
        }
      }

      // ── Case 2: accepted, no ERA within adjudicationSlaDays ────
      if (claim.status === "accepted") {
        const acceptedRef =
          claim.adjudications[0]?.parsedAt ??
          claim.submissions[0]?.respondedAt ??
          claim.submittedAt;
        if (acceptedRef) {
          const daysWaited = Math.floor(
            (now.getTime() - acceptedRef.getTime()) / 86_400_000,
          );
          if (daysWaited > rule.adjudicationSlaDays) {
            findings.push({
              claimId: claim.id,
              claimNumber: claim.claimNumber,
              payerName: claim.payerName,
              category: "adjudication_timeout",
              daysWaited,
              slaDays: rule.adjudicationSlaDays,
              recommendedAction: `Call ${rule.displayName} for claim status. Their adjudication SLA is ${rule.adjudicationSlaDays} days; this one is ${daysWaited} days silent. The claim may be pended in the payer's edit queue without a 277CA notification.`,
              taskId: null,
            });
            adjudicationTimeoutCount++;
          }
        }
      }

      // ── Case 3: approaching timely-filing deadline ───────────
      if (claim.timelyFilingDeadline) {
        const daysRemaining = Math.floor(
          (claim.timelyFilingDeadline.getTime() - now.getTime()) / 86_400_000,
        );
        // Flag when the claim is still in-flight (not yet paid) and the
        // deadline is within 2 weeks — gives the biller time to refile.
        if (daysRemaining <= 14 && daysRemaining >= 0) {
          findings.push({
            claimId: claim.id,
            claimNumber: claim.claimNumber,
            payerName: claim.payerName,
            category: "timely_filing_warning",
            daysWaited: 0,
            slaDays: daysRemaining,
            recommendedAction: `Timely-filing window closes in ${daysRemaining} day(s). If the claim is still in flight, consider refiling via corrected claim (frequency ${rule.correctedClaimFrequency}) or switching to paper submission to preserve the filing date.`,
            taskId: null,
          });
          timelyFilingWarnings++;
        }
      }
    }

    // ── Materialize tasks + emit review events ──────────────────
    ctx.assertCan("write.task");
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
    for (const f of findings) {
      // Dedupe: don't open a second task for the same claim within 7 days.
      const existing = await prisma.task.findFirst({
        where: {
          organizationId,
          createdAt: { gte: sevenDaysAgo },
          title: { contains: `stale-${f.category}` },
          description: { contains: f.claimId },
        },
      });
      if (existing) continue;

      const task = await prisma.task.create({
        data: {
          organizationId,
          patientId: null,
          title: `Stale claim [stale-${f.category}] ${f.claimNumber ?? f.claimId.slice(0, 8)} — ${f.payerName ?? "payer"}`,
          description: `${f.recommendedAction}\n\nClaim id: ${f.claimId}\nCategory: ${f.category}\nDays waited: ${f.daysWaited}\nSLA days: ${f.slaDays}\n\n[Created by staleClaimMonitor agent]`,
          status: "open",
          kind: "billing_followup",
          assigneeRole: "operator",
          dueAt: new Date(Date.now() + 2 * 86_400_000),
        },
      });
      f.taskId = task.id;
    }

    await writeAgentAudit(
      "staleClaimMonitor",
      "1.0.0",
      organizationId,
      "stale.claim.scan",
      { type: "Organization", id: organizationId },
      {
        claimsChecked: candidates.length,
        ackTimeoutCount,
        adjudicationTimeoutCount,
        timelyFilingWarnings,
      },
    );

    ctx.log("info", "Stale claim monitor complete", {
      claimsChecked: candidates.length,
      ackTimeout: ackTimeoutCount,
      adjudicationTimeout: adjudicationTimeoutCount,
      timelyFilingWarnings,
    });

    return {
      organizationId,
      claimsChecked: candidates.length,
      ackTimeoutCount,
      adjudicationTimeoutCount,
      timelyFilingWarnings,
      findings,
    };
  },
};
