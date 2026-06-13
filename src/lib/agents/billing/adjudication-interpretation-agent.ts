import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { startReasoning } from "../memory/agent-reasoning";
import {
  classifyAdjustment,
  splitPatientResponsibility,
  reconcileClaimTotals,
  type PatientRespSplit,
} from "@/lib/billing/remittance";

// ---------------------------------------------------------------------------
// Adjudication Interpretation Agent
// ---------------------------------------------------------------------------
// Wakes up when an ERA/835 is received. Parses the payer's decision, matches
// payments and adjustments to claims, detects denials and underpayments, and
// routes each to the appropriate downstream agent.
//
// This is the bridge between "payer made a decision" and "we act on it."
//
// Layer 3 state transition: accepted → adjudicated → (paid | partial | denied)
// Layer 4 events: subscribes adjudication.received
//   emits: payment.received, denial.detected, underpayment.detected
// ---------------------------------------------------------------------------

const input = z.object({
  claimId: z.string(),
  adjudicationResultId: z.string(),
  organizationId: z.string(),
});

const output = z.object({
  claimId: z.string(),
  claimStatus: z.string(),
  totalPaidCents: z.number(),
  totalDeniedCents: z.number(),
  totalAdjustedCents: z.number(),
  totalPatientRespCents: z.number(),
  denialEventsCreated: z.number(),
  paymentsCreated: z.number(),
  /** Per-bucket split of patient responsibility — drives accurate
   * statement line items (deductible / coinsurance / copay). */
  patientRespSplit: z.object({
    deductibleCents: z.number(),
    coinsuranceCents: z.number(),
    copayCents: z.number(),
    nonCoveredCents: z.number(),
    otherPrCents: z.number(),
  }),
  /** Takebacks detected on the line (negative amounts). */
  takebackCents: z.number(),
  /** true when billed = paid + adjustments within tolerance. */
  balanced: z.boolean(),
  balanceVarianceCents: z.number(),
});

export const adjudicationInterpretationAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "adjudicationInterpretation",
  version: "1.0.0",
  description:
    "Parses ERA/835 adjudication results. Matches payments to claims, " +
    "creates denial events for denied lines, detects underpayments, and " +
    "routes to appropriate downstream agents.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: [
    "read.claim",
    "read.payment",
    "write.claim.status",
    "write.financialEvent",
    "write.denial.triage",
  ],
  requiresApproval: false,

  async run({ claimId, adjudicationResultId, organizationId }, ctx) {
    const trace = startReasoning("adjudicationInterpretation", "1.0.0", ctx.jobId);
    trace.step("begin adjudication interpretation", { claimId, adjudicationResultId });

    ctx.assertCan("read.claim");

    // ── Load the adjudication result + claim ────────────────────
    const adjResult = await prisma.adjudicationResult.findUnique({
      where: { id: adjudicationResultId },
    });
    if (!adjResult) throw new Error(`AdjudicationResult ${adjudicationResultId} not found`);

    const claim = await prisma.claim.findUnique({
      where: { id: claimId },
      include: { patient: true },
    });
    if (!claim) throw new Error(`Claim ${claimId} not found`);

    // ── Idempotency guard ───────────────────────────────────────
    // This agent may be retried/replayed for the same AdjudicationResult.
    // Every money-moving posting below tags its FinancialEvent with
    // metadata.adjudicationResultId; if one already exists, this remit has
    // already been posted — return a no-op so we never double-post a payment
    // or contractual adjustment. (Denial-only remits that move no money are
    // additionally guarded per-DenialEvent below.)
    const alreadyPosted = await prisma.financialEvent.findFirst({
      where: {
        claimId,
        metadata: { path: ["adjudicationResultId"], equals: adjudicationResultId },
      },
      select: { id: true },
    });
    if (alreadyPosted) {
      trace.conclude({
        confidence: 1,
        summary: `Adjudication ${adjudicationResultId} already posted — no-op (idempotent).`,
      });
      await trace.persist();
      return {
        claimId,
        claimStatus: claim.status,
        totalPaidCents: adjResult.totalPaidCents,
        totalDeniedCents: 0,
        totalAdjustedCents: adjResult.totalAdjustedCents,
        totalPatientRespCents: adjResult.totalPatientRespCents,
        denialEventsCreated: 0,
        paymentsCreated: 0,
        patientRespSplit: {
          deductibleCents: 0,
          coinsuranceCents: 0,
          copayCents: 0,
          nonCoveredCents: 0,
          otherPrCents: 0,
        },
        takebackCents: 0,
        balanced: true,
        balanceVarianceCents: 0,
      };
    }

    trace.step("loaded adjudication + claim", {
      claimStatus: adjResult.claimStatus,
      totalPaidCents: adjResult.totalPaidCents,
      totalAllowedCents: adjResult.totalAllowedCents,
    });

    const lineDetails = Array.isArray(adjResult.lineDetails)
      ? (adjResult.lineDetails as any[])
      : [];

    let totalDeniedCents = 0;
    let denialEventsCreated = 0;
    let paymentsCreated = 0;

    // ── Normalize per-line adjustments ──────────────────────────
    // Each line can carry MULTIPLE adjustments (stacked CARCs: PR-1
    // deductible + PR-2 coinsurance + CO-45 contractual all on the same
    // line). The legacy code only looked at a single carcCode and
    // silently dropped the others. We normalize into one flat array,
    // run them through the shared taxonomy, and split PR by sub-bucket.
    const allAdjustments: Array<{
      groupCode: string;
      carcCode: string | null;
      rarcCode: string | null;
      amountCents: number;
      sequence: number | null;
    }> = [];
    for (const line of lineDetails) {
      const seq: number | null = line.sequence ?? null;
      // Shape A: { adjustments: [{ groupCode, carcCode, amount }] }
      if (Array.isArray(line.adjustments)) {
        for (const adj of line.adjustments) {
          allAdjustments.push({
            groupCode: String(adj.groupCode ?? "CO"),
            carcCode: adj.carcCode ? String(adj.carcCode) : null,
            rarcCode: adj.rarcCode ? String(adj.rarcCode) : null,
            amountCents: Number(adj.amountCents ?? 0),
            sequence: seq,
          });
        }
        continue;
      }
      // Shape B (legacy): flat line with a single carcCode/deniedAmountCents
      if (line.carcCode && line.deniedAmountCents) {
        allAdjustments.push({
          groupCode: String(line.groupCode ?? "CO"),
          carcCode: String(line.carcCode),
          rarcCode: line.rarcCode ? String(line.rarcCode) : null,
          amountCents: Number(line.deniedAmountCents),
          sequence: seq,
        });
      }
    }

    // ── Patient responsibility sub-bucket split ─────────────────
    const prSplit: PatientRespSplit = splitPatientResponsibility(
      allAdjustments.map((a) => ({
        groupCode: a.groupCode,
        carcCode: a.carcCode,
        amountCents: a.amountCents,
      })),
    );
    trace.step("split patient responsibility", {
      deductibleCents: prSplit.deductibleCents,
      coinsuranceCents: prSplit.coinsuranceCents,
      copayCents: prSplit.copayCents,
      nonCoveredCents: prSplit.nonCoveredCents,
      contractualCents: prSplit.contractualCents,
      recoverableCoCents: prSplit.recoverableCoCents,
      takebackCents: prSplit.takebackCents,
    });

    // ── Create one DenialEvent per recoverable / non-PR adjustment ─
    for (const adj of allAdjustments) {
      const cls = classifyAdjustment({
        groupCode: adj.groupCode,
        carcCode: adj.carcCode,
        amountCents: adj.amountCents,
      });
      // Skip PR lines — they go on the patient statement, not a
      // denial event. Skip any NON-recoverable non-PR adjustment: pure
      // contractual CO-45, sequestration, AND informational OA/PI codes
      // like OA-23 (prior-payer impact on a secondary claim) or OA-94.
      // The old guard only skipped non-recoverable CO, so every OA/PI line
      // spawned a spurious DenialEvent + denial.detected (kicking off the
      // appeals workflow for normal COB).
      if (cls.group === "PR") continue;
      if (!cls.recoverable) continue;
      if (cls.isTakeback) continue; // takebacks are handled separately
      if (adj.amountCents <= 0) continue;
      if (!adj.carcCode) continue; // can't classify without a CARC

      // Idempotent for denial-only remits (which write no money-tagged
      // FinancialEvent for the top-level guard to catch): don't re-book a
      // denial we already recorded for this line+CARC.
      const existingDenial = await prisma.denialEvent.findFirst({
        where: {
          claimId,
          carcCode: adj.carcCode,
          claimLineSequence: adj.sequence,
          amountDeniedCents: adj.amountCents,
        },
        select: { id: true },
      });
      if (existingDenial) continue;

      const denialEvent = await prisma.denialEvent.create({
        data: {
          claimId,
          claimLineSequence: adj.sequence,
          carcCode: adj.carcCode,
          rarcCode: adj.rarcCode,
          groupCode: adj.groupCode,
          amountDeniedCents: adj.amountCents,
          recoverable: cls.recoverable,
          recoverableAmountCents: cls.recoverable ? adj.amountCents : null,
        },
      });

      totalDeniedCents += adj.amountCents;
      denialEventsCreated++;

      await ctx.emit({
        name: "denial.detected",
        claimId,
        denialEventId: denialEvent.id,
        carcCode: adj.carcCode,
        groupCode: adj.groupCode,
        amountDeniedCents: adj.amountCents,
        organizationId,
      });

      trace.step("created denial event", {
        carcCode: adj.carcCode,
        groupCode: adj.groupCode,
        amountCents: adj.amountCents,
        recoverable: cls.recoverable,
      });
    }

    // ── Takeback handling ──────────────────────────────────────
    // A takeback (negative paid or group=WO) means the payer is
    // reversing a prior posting. We emit a specific event so the
    // reconciliation agent knows to unapply the prior payment rather
    // than double-count.
    if (prSplit.takebackCents > 0) {
      await ctx.emit({
        name: "human.review.required",
        sourceAgent: "adjudicationInterpretation",
        category: "novel_situation",
        claimId,
        patientId: claim.patientId,
        summary: `Takeback detected on claim ${claim.claimNumber ?? claimId}: $${(prSplit.takebackCents / 100).toFixed(2)} reversed on this ERA. The prior posting needs to be unapplied.`,
        suggestedAction:
          "Verify the prior ERA, reverse the original payment posting in the ledger, and re-file if appropriate.",
        tier: 2,
        organizationId,
      });
      trace.step("takeback flagged", { takebackCents: prSplit.takebackCents });
    }

    // ── Create payment record if any amount was paid ────────────
    if (adjResult.totalPaidCents > 0) {
      ctx.assertCan("write.financialEvent");

      const payment = await prisma.payment.create({
        data: {
          claimId,
          source: "insurance",
          amountCents: adjResult.totalPaidCents,
          paymentDate: adjResult.eraDate,
          reference: adjResult.checkNumber,
          notes: `ERA payment — ${adjResult.claimStatus}`,
        },
      });
      paymentsCreated++;

      // RECON-3: write the ledger event the reconciliation agent matches on
      // (it looks up FinancialEvent{ paymentId, type: "insurance_paid" }).
      // Without this every ERA payment showed as "unmatched" and the
      // FinancialEvent ledger — declared the source of truth for balances —
      // omitted insurance cash entirely. Money in = positive. The
      // adjudicationResultId tag also arms the idempotency guard above.
      await prisma.financialEvent.create({
        data: {
          organizationId,
          patientId: claim.patientId,
          claimId,
          paymentId: payment.id,
          type: "insurance_paid",
          amountCents: adjResult.totalPaidCents,
          description: `Insurance payment — ERA ${adjResult.checkNumber ?? ""}`.trim(),
          metadata: { source: "era", adjudicationResultId },
          createdByAgent: "adjudicationInterpretation@1.0.0",
        },
      });

      await ctx.emit({
        name: "payment.received",
        paymentId: payment.id,
        claimId,
        organizationId,
      });

      trace.step("created payment", {
        amountCents: adjResult.totalPaidCents,
        checkNumber: adjResult.checkNumber,
      });
    }

    // ── Create contractual adjustments ──────────────────────────
    if (adjResult.totalAdjustedCents > 0) {
      await prisma.adjustment.create({
        data: {
          claimId,
          type: "contractual",
          amountCents: adjResult.totalAdjustedCents,
          reason: "Contractual adjustment per payer agreement",
          postedAt: new Date(),
        },
      });
      // Mirror the write-off into the FinancialEvent ledger (stored positive
      // to match the statement aggregator's subtract convention). Also tags
      // the adjudicationResultId so a contractual-only remit (paid = 0) is
      // covered by the idempotency guard.
      await prisma.financialEvent.create({
        data: {
          organizationId,
          patientId: claim.patientId,
          claimId,
          type: "contractual_adjustment",
          amountCents: adjResult.totalAdjustedCents,
          description: "Contractual adjustment per payer agreement",
          metadata: { source: "era", adjudicationResultId },
          createdByAgent: "adjudicationInterpretation@1.0.0",
        },
      });
      trace.step("created contractual adjustment", {
        amountCents: adjResult.totalAdjustedCents,
      });
    }

    // ── Update claim status ─────────────────────────────────────
    ctx.assertCan("write.claim.status");

    let finalStatus: string;
    if (denialEventsCreated > 0 && adjResult.totalPaidCents === 0) {
      finalStatus = "denied";
    } else if (denialEventsCreated > 0 && adjResult.totalPaidCents > 0) {
      finalStatus = "partial";
    } else {
      finalStatus = "paid";
    }

    await prisma.claim.update({
      where: { id: claimId },
      data: {
        status: finalStatus as any,
        // INCREMENT, not set: a claim can receive multiple ERAs (partial pay
        // then the balance, or primary then secondary). Setting clobbered any
        // prior payment. The idempotency guard above prevents the same ERA
        // from being counted twice.
        paidAmountCents: { increment: adjResult.totalPaidCents },
        allowedAmountCents: adjResult.totalAllowedCents,
        patientRespCents: adjResult.totalPatientRespCents,
        paidAt: adjResult.totalPaidCents > 0 ? new Date() : undefined,
        deniedAt: finalStatus === "denied" ? new Date() : undefined,
      },
    });

    trace.step("updated claim status", { finalStatus });

    // ── Check for underpayment ──────────────────────────────────
    // Compare paid amount against the fee schedule expected amount
    if (adjResult.totalPaidCents > 0 && claim.billedAmountCents > 0) {
      // Expected PAYER payment = billed − contractual write-off − patient
      // responsibility. The old formula omitted patient responsibility, so a
      // claim with a copay/deductible looked underpaid by exactly that amount
      // (a false-positive on every cost-share claim).
      const expectedPayerPaymentCents =
        claim.billedAmountCents - adjResult.totalAdjustedCents - adjResult.totalPatientRespCents;
      const varianceCents = expectedPayerPaymentCents - adjResult.totalPaidCents;
      const variancePct = varianceCents / claim.billedAmountCents;

      if (varianceCents > 500 && variancePct > 0.05) {
        // $5+ and 5%+ variance = meaningful underpayment
        await ctx.emit({
          name: "underpayment.detected",
          claimId,
          expectedCents: expectedPayerPaymentCents,
          actualCents: adjResult.totalPaidCents,
          varianceCents,
          organizationId,
        });
        trace.step("underpayment detected", {
          expectedCents: expectedPayerPaymentCents,
          actualCents: adjResult.totalPaidCents,
          varianceCents,
        });
      }
    }

    // ── Patient responsibility — emit per sub-bucket ──────────────
    // The patient statement needs to show "deductible $X, coinsurance $Y,
    // copay $Z" separately, not a single undifferentiated bucket. Each
    // bucket emits its own patient.balance.created event so the
    // statement builder can render a correct line item.
    const prBuckets: Array<{ source: string; amountCents: number }> = [
      { source: "deductible", amountCents: prSplit.deductibleCents },
      { source: "coinsurance", amountCents: prSplit.coinsuranceCents },
      { source: "copay", amountCents: prSplit.copayCents },
      { source: "non_covered", amountCents: prSplit.nonCoveredCents },
      { source: "patient_other", amountCents: prSplit.otherPrCents },
    ];
    for (const b of prBuckets) {
      if (b.amountCents <= 0) continue;
      await ctx.emit({
        name: "patient.balance.created",
        patientId: claim.patientId,
        claimId,
        amountCents: b.amountCents,
        source: b.source,
        organizationId,
      });
      trace.step("patient responsibility — bucket emitted", {
        source: b.source,
        amountCents: b.amountCents,
      });
    }

    // ── RA totals reconciliation ────────────────────────────────
    // An ERA should satisfy billed = paid + adjustments. If it doesn't,
    // something is misposted or the parser dropped a line — flag it for
    // human review rather than silently accept the mismatch.
    // billed = paid + all-adjustments, where all-adjustments = contractual
    // (non-PR, in totalAdjustedCents) + patient responsibility. We do NOT add
    // totalDeniedCents: a denied line is itself a non-PR adjustment already
    // included in totalAdjustedCents, so adding it again double-counted and
    // flagged every cost-share remit as unbalanced.
    const totalAdjCents = adjResult.totalAdjustedCents + adjResult.totalPatientRespCents;
    const balance = reconcileClaimTotals({
      billedCents: claim.billedAmountCents,
      paidCents: adjResult.totalPaidCents,
      adjustmentsCents: totalAdjCents,
      toleranceCents: 2,
    });
    if (!balance.balanced) {
      ctx.log("warn", "ERA totals do not balance", { message: balance.message });
      await ctx.emit({
        name: "human.review.required",
        sourceAgent: "adjudicationInterpretation",
        category: "novel_situation",
        claimId,
        patientId: claim.patientId,
        summary: balance.message,
        suggestedAction:
          "Re-read the raw ERA. Either the parser dropped a CAS segment or the payer sent an unbalanced RA. Do not close the claim until totals reconcile.",
        tier: 2,
        organizationId,
      });
      trace.step("RA totals variance", { varianceCents: balance.varianceCents });
    }

    // ── Audit + close ───────────────────────────────────────────
    await writeAgentAudit(
      "adjudicationInterpretation",
      "1.0.0",
      organizationId,
      "adjudication.interpreted",
      { type: "Claim", id: claimId },
      {
        finalStatus,
        paidCents: adjResult.totalPaidCents,
        deniedCents: totalDeniedCents,
        denialEvents: denialEventsCreated,
        patientRespCents: adjResult.totalPatientRespCents,
      },
    );

    trace.conclude({
      confidence: 0.95, // ERA parsing is deterministic, confidence is high
      summary: `Interpreted adjudication: ${finalStatus}. Paid $${(adjResult.totalPaidCents / 100).toFixed(2)}, denied $${(totalDeniedCents / 100).toFixed(2)}, patient resp $${(adjResult.totalPatientRespCents / 100).toFixed(2)}. ${denialEventsCreated} denial event(s), ${paymentsCreated} payment(s).`,
    });
    await trace.persist();

    return {
      claimId,
      claimStatus: finalStatus,
      totalPaidCents: adjResult.totalPaidCents,
      totalDeniedCents: totalDeniedCents,
      totalAdjustedCents: adjResult.totalAdjustedCents,
      totalPatientRespCents: adjResult.totalPatientRespCents,
      denialEventsCreated,
      paymentsCreated,
      patientRespSplit: {
        deductibleCents: prSplit.deductibleCents,
        coinsuranceCents: prSplit.coinsuranceCents,
        copayCents: prSplit.copayCents,
        nonCoveredCents: prSplit.nonCoveredCents,
        otherPrCents: prSplit.otherPrCents,
      },
      takebackCents: prSplit.takebackCents,
      balanced: balance.balanced,
      balanceVarianceCents: balance.balanced ? 0 : balance.varianceCents,
    };
  },
};

// NOTE: recoverability is now sourced from the shared CARC taxonomy in
// src/lib/billing/remittance.ts (see classifyAdjustment). The local
// isRecoverable() helper was removed — downstream agents should call
// classifyAdjustment directly to get the same answer.
