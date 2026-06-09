import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { ageClaims, recoverabilityScore } from "@/lib/billing/aging";
import { formatMoney } from "@/lib/domain/billing";

// ---------------------------------------------------------------------------
// Aging Agent
// ---------------------------------------------------------------------------
// Per PRD §13.2 #10: "Keep A/R moving."
//
// Daily sweep that:
//   - Computes aging across all open claims
//   - Identifies high-priority items (old + recoverable + high $)
//   - Creates follow-up tasks for any claim past 60 days that hasn't been
//     touched recently
//   - Escalates 90+ day items to high priority
// ---------------------------------------------------------------------------

const input = z.object({ organizationId: z.string() });

const output = z.object({
  organizationId: z.string(),
  agedTotal: z.number(),
  insuranceTotal: z.number(),
  patientTotal: z.number(),
  tasksCreated: z.number(),
  highPriorityCount: z.number(),
  generatedAt: z.string(),
});

export const agingAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: "aging",
  version: "1.0.0",
  description:
    "Daily A/R sweep. Identifies stale claims, ranks by recoverability, " +
    "and creates follow-up tasks for the billing team.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.claim", "read.payment", "write.task"],
  requiresApproval: false,

  async run({ organizationId }, ctx) {
    ctx.assertCan("read.claim");
    ctx.log("info", "Running aging sweep", { organizationId });

    const claims = await prisma.claim.findMany({
      where: {
        organizationId,
        status: { notIn: ["written_off"] },
      },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        payments: { select: { source: true, amountCents: true } },
      },
    });

    const { aged, totals } = ageClaims(claims);

    // Items to escalate: 60+ days, high recoverability, real dollars
    const escalations = aged.filter(
      (a) => a.ageDays >= 60 && a.balanceCents >= 1000 && recoverabilityScore(a) >= 30,
    );

    let tasksCreated = 0;
    let highPriorityCount = 0;

    ctx.assertCan("write.task");

    // De-dupe — only create tasks for claims we haven't already flagged in
    // the last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    for (const entry of escalations) {
      const patient = claims.find((c) => c.id === entry.id)?.patient;
      if (!patient) continue;

      // Check if we already have an aging task for this claim
      const existing = await prisma.task.findFirst({
        where: {
          patientId: patient.id,
          createdAt: { gte: sevenDaysAgo },
          title: { contains: "A/R follow-up" },
        },
      });
      if (existing) continue;

      const isHighPriority = entry.ageDays >= 90 || entry.balanceCents >= 30000;
      if (isHighPriority) highPriorityCount++;

      const dueDays = isHighPriority ? 2 : 5;

      await prisma.task.create({
        data: {
          organizationId,
          patientId: patient.id,
          title: `A/R follow-up: ${patient.firstName} ${patient.lastName} (${entry.ageDays}d)`,
          description: `Open balance: ${formatMoney(entry.balanceCents)}\nPayer: ${entry.payerName ?? "Self-pay"}\nStatus: ${entry.status}\nInsurance owes: ${formatMoney(entry.insuranceBalanceCents)}\nPatient owes: ${formatMoney(entry.patientBalanceCents)}\nRecoverability: ${recoverabilityScore(entry)}%\n\n[Created by aging agent]`,
          status: "open",
          kind: "billing_followup",
          assigneeRole: "operator",
          dueAt: new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000),
        },
      });

      tasksCreated++;
    }

    ctx.log("info", "Aging sweep complete", {
      totalClaims: claims.length,
      agedClaims: aged.length,
      escalations: escalations.length,
      tasksCreated,
      highPriority: highPriorityCount,
    });

    return {
      organizationId,
      agedTotal: totals.total,
      insuranceTotal: totals.insurance,
      patientTotal: totals.patient,
      tasksCreated,
      highPriorityCount,
      generatedAt: new Date().toISOString(),
    };
  },
};
