import { prisma } from "@/lib/db/prisma";
import { formatMoney, formatMoneyCompact } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Billing domain — computed balances, summaries, helpers
// ---------------------------------------------------------------------------

export { formatMoney, formatMoneyCompact };

export interface PatientFinancialSummary {
  // Balance summary
  totalBalanceCents: number;
  patientResponsibilityCents: number;
  insurancePendingCents: number;
  currentDueCents: number;
  overdueCents: number;
  creditBalanceCents: number;

  // Breakdown by bucket
  copayOwedCents: number;
  copayPaidCents: number;
  deductibleAppliedCents: number;
  coinsuranceOwedCents: number;
  cashPayBalanceCents: number;

  // Activity summary
  lastPaymentDate: Date | null;
  hasCardOnFile: boolean;
  hasActivePaymentPlan: boolean;
  openStatementsCount: number;
  overdueStatementsCount: number;
}

/**
 * Compute the full financial summary for a patient.
 * Walks the Claim, Payment, Statement, and PaymentPlan tables.
 */
export async function getPatientFinancialSummary(
  patientId: string,
): Promise<PatientFinancialSummary> {
  const [claims, statements, paymentPlan, paymentMethod] = await Promise.all([
    prisma.claim.findMany({
      where: { patientId },
      include: { payments: true },
    }),
    prisma.statement.findMany({
      where: { patientId, status: { notIn: ["paid", "voided"] } },
    }),
    prisma.paymentPlan.findFirst({
      where: { patientId, status: "active" },
    }),
    prisma.storedPaymentMethod.findFirst({
      where: { patientId, active: true },
    }),
  ]);

  // Insurance pending = what the payer still owes on in-flight claims.
  // Per claim that's billed − insurance already paid − patient responsibility
  // (mirrors aging.ts). The old version summed the FULL billedAmountCents,
  // which ignored payments already received AND double-counted the patient's
  // portion (that same amount is also in patientResponsibilityCents below,
  // so totalBalanceCents = patientResp + insurancePending overstated the
  // headline balance).
  const insurancePendingCents = claims
    .filter((c) => c.status === "submitted" || c.status === "accepted" || c.status === "adjudicated")
    .reduce((acc, c) => {
      const insurancePaid = c.payments
        .filter((p) => p.source === "insurance")
        .reduce((sum, p) => sum + p.amountCents, 0);
      return acc + Math.max(0, c.billedAmountCents - insurancePaid - c.patientRespCents);
    }, 0);

  // Patient responsibility = sum of patient resp on all claims minus patient payments
  const patientRespTotal = claims.reduce(
    (acc, c) => acc + c.patientRespCents,
    0,
  );
  const patientPaymentsTotal = claims.reduce(
    (acc, c) =>
      acc +
      c.payments
        .filter((p) => p.source === "patient")
        .reduce((sum, p) => sum + p.amountCents, 0),
    0,
  );
  const patientResponsibilityCents = Math.max(
    0,
    patientRespTotal - patientPaymentsTotal,
  );

  // Current due = amount on active statements
  const currentDueCents = statements.reduce(
    (acc, s) => acc + (s.amountDueCents - s.paidToDateCents),
    0,
  );

  // Overdue = statements past due date
  const overdueStatements = statements.filter(
    (s) => s.dueDate < new Date() && s.status !== "paid",
  );
  const overdueCents = overdueStatements.reduce(
    (acc, s) => acc + (s.amountDueCents - s.paidToDateCents),
    0,
  );

  // Credit balance: payments exceed charges
  const creditBalanceCents = Math.max(
    0,
    patientPaymentsTotal - patientRespTotal,
  );

  // Copay stats (from financial events)
  const copayEvents = await prisma.financialEvent.findMany({
    where: {
      patientId,
      type: { in: ["copay_assessed", "copay_collected"] },
    },
  });
  const copayAssessed = copayEvents
    .filter((e) => e.type === "copay_assessed")
    .reduce((acc, e) => acc + e.amountCents, 0);
  const copayPaidCents = copayEvents
    .filter((e) => e.type === "copay_collected")
    .reduce((acc, e) => acc + e.amountCents, 0);
  const copayOwedCents = Math.max(0, copayAssessed - copayPaidCents);

  // Deductible (from coverage if available)
  const coverage = await prisma.patientCoverage.findFirst({
    where: { patientId, type: "primary", active: true },
  });
  const deductibleAppliedCents = coverage?.deductibleMetCents ?? 0;

  // Last payment
  const lastPayment = await prisma.payment.findFirst({
    where: {
      claim: { patientId },
      source: "patient",
    },
    orderBy: { paymentDate: "desc" },
  });

  return {
    totalBalanceCents: patientResponsibilityCents + insurancePendingCents,
    patientResponsibilityCents,
    insurancePendingCents,
    currentDueCents,
    overdueCents,
    creditBalanceCents,
    copayOwedCents,
    copayPaidCents,
    deductibleAppliedCents,
    coinsuranceOwedCents: 0, // simplified for now
    cashPayBalanceCents: 0,
    lastPaymentDate: lastPayment?.paymentDate ?? null,
    hasCardOnFile: !!paymentMethod,
    hasActivePaymentPlan: !!paymentPlan,
    openStatementsCount: statements.length,
    overdueStatementsCount: overdueStatements.length,
  };
}
