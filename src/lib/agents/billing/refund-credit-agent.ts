import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { formatMoney } from "@/lib/domain/billing";

/**
 * Decide how to handle a patient credit balance. Pure so the policy is
 * testable without spinning Prisma. Thresholds:
 *   - >= $200 and no open balance → refund (approval required)
 *   - $50..$200 and no open balance, ≥180d old → refund (approval required)
 *   - > $0 with any open balance → transfer
 *   - < $5 and ≥365d old → write_off (small-balance cleanup)
 *   - default → hold
 */
export function resolveCreditAction(args: {
  creditCents: number;
  hasOpenBalance: boolean;
  oldestCreditAgeDays: number;
}): {
  action: "transfer" | "refund" | "hold" | "write_off";
  reason: string;
} {
  if (args.creditCents <= 0) {
    return { action: "hold", reason: "No credit present." };
  }
  if (args.hasOpenBalance) {
    return {
      action: "transfer",
      reason: `Patient has ${formatMoney(args.creditCents)} credit and an open balance — apply credit to the open balance before considering a refund.`,
    };
  }
  if (args.creditCents >= 20000) {
    return {
      action: "refund",
      reason: `Patient has ${formatMoney(args.creditCents)} credit (≥ $200) with no open balance. Issue a refund (approval required).`,
    };
  }
  if (args.creditCents >= 5000 && args.oldestCreditAgeDays >= 180) {
    return {
      action: "refund",
      reason: `Patient has ${formatMoney(args.creditCents)} credit that has been on file ≥180 days. Compliance requires a refund (approval required).`,
    };
  }
  if (args.creditCents < 500 && args.oldestCreditAgeDays >= 365) {
    return {
      action: "write_off",
      reason: `Tiny residual credit (${formatMoney(args.creditCents)}) aged ≥1 year. Small-balance cleanup.`,
    };
  }
  return {
    action: "hold",
    reason: `Credit of ${formatMoney(args.creditCents)} — hold pending the next visit's charges.`,
  };
}

// ---------------------------------------------------------------------------
// Refund / Credit Agent
// ---------------------------------------------------------------------------
// Per PRD §13.2 #12: "Prevent chaos in credits and refunds. Detect credit
// balances. Recommend transfer, refund, or hold action. Enforce approval
// rules."
//
// This agent walks all patients with potential credit balances and:
//   1. Identifies overpayments (patient paid more than they owed)
//   2. Looks for other open balances on the same patient that the credit
//      could be transferred to
//   3. Creates a Task with the recommended action — transfer, refund, or
//      hold (default: hold pending review)
//
// Refund issuance is approval-gated by policy — this agent only RECOMMENDS,
// never executes refunds automatically.
// ---------------------------------------------------------------------------

const input = z.object({ organizationId: z.string() });

const output = z.object({
  organizationId: z.string(),
  patientsChecked: z.number(),
  creditsFound: z.number(),
  totalCreditCents: z.number(),
  recommendations: z.array(
    z.object({
      patientId: z.string(),
      creditCents: z.number(),
      action: z.enum(["transfer", "refund", "hold", "write_off"]),
      reason: z.string(),
      taskId: z.string().nullable(),
    }),
  ),
});

export const refundCreditAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "refundCredit",
  version: "1.0.0",
  description:
    "Detects patient credit balances and recommends transfer, refund, " +
    "or hold action. Approval-gated — never auto-issues refunds.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.claim", "read.payment", "write.task"],
  // Drives refund / credit-transfer recommendations. The agent's own
  // description promises it is approval-gated ("never auto-issues refunds") —
  // this flag enforces that contract. Money leaving the practice must have a
  // human signature upstream of the recommendation task.
  requiresApproval: true,

  async run({ organizationId }, ctx) {
    ctx.assertCan("read.claim");
    ctx.log("info", "Running refund/credit detection", { organizationId });

    // Pull all patients in the org with their claims + payments
    const patients = await prisma.patient.findMany({
      where: { organizationId, deletedAt: null },
      include: {
        claims: {
          include: { payments: true },
        },
      },
    });

    const recommendations: {
      patientId: string;
      creditCents: number;
      action: "transfer" | "refund" | "hold" | "write_off";
      reason: string;
      taskId: string | null;
    }[] = [];

    let totalCreditCents = 0;

    for (const patient of patients) {
      // Compute total patient resp vs total patient payments
      const totalRespCents = patient.claims.reduce(
        (acc, c) => acc + c.patientRespCents,
        0,
      );
      const totalPatientPaidCents = patient.claims.reduce(
        (acc, c) =>
          acc +
          c.payments
            .filter((p) => p.source === "patient")
            .reduce((sum, p) => sum + p.amountCents, 0),
        0,
      );

      const creditCents = totalPatientPaidCents - totalRespCents;
      if (creditCents <= 0) continue;

      totalCreditCents += creditCents;

      // Check for OTHER open balances we could transfer the credit to
      const openOtherBalance = patient.claims.some(
        (c) =>
          c.status !== "paid" &&
          c.status !== "written_off" &&
          c.patientRespCents > 0 &&
          c.payments
            .filter((p) => p.source === "patient")
            .reduce((sum, p) => sum + p.amountCents, 0) < c.patientRespCents,
      );

      // Age the oldest patient payment that contributed to the credit so
      // stale credits auto-escalate to refund per compliance timelines.
      const patientPaymentDates = patient.claims.flatMap((c) =>
        c.payments
          .filter((p) => p.source === "patient")
          .map((p) => p.paymentDate),
      );
      const oldest = patientPaymentDates.reduce<Date | null>(
        (acc, d) => (acc == null || d < acc ? d : acc),
        null,
      );
      const oldestCreditAgeDays = oldest
        ? Math.floor((Date.now() - oldest.getTime()) / 86_400_000)
        : 0;

      const { action, reason } = resolveCreditAction({
        creditCents,
        hasOpenBalance: openOtherBalance,
        oldestCreditAgeDays,
      });

      // Avoid duplicate task creation within 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const existing = await prisma.task.findFirst({
        where: {
          patientId: patient.id,
          createdAt: { gte: sevenDaysAgo },
          title: { contains: "Credit balance" },
        },
      });

      let taskId: string | null = null;
      if (!existing) {
        ctx.assertCan("write.task");
        const task = await prisma.task.create({
          data: {
            organizationId,
            patientId: patient.id,
            title: `Credit balance: ${patient.firstName} ${patient.lastName} (${formatMoney(creditCents)})`,
            description: `${reason}\n\nRecommended action: ${action.toUpperCase()}\n\n[Created by refundCredit agent]`,
            status: "open",
            kind: "billing_followup",
            assigneeRole: "operator",
            dueAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
          },
        });
        taskId = task.id;
      }

      recommendations.push({
        patientId: patient.id,
        creditCents,
        action,
        reason,
        taskId,
      });
    }

    ctx.log("info", "Refund/credit detection complete", {
      patientsChecked: patients.length,
      creditsFound: recommendations.length,
      totalCreditCents,
    });

    return {
      organizationId,
      patientsChecked: patients.length,
      creditsFound: recommendations.length,
      totalCreditCents,
      recommendations,
    };
  },
};
