/**
 * Aging Logic — bucketing + queue prioritization.
 *
 * Per PRD section 11.4:
 *   - Insurance A/R vs Patient A/R (separate)
 *   - Buckets: 0-30, 31-60, 61-90, 91-120, 120+
 *   - Segmented by payer, provider, location, CPT, encounter type, denial status
 */

export type AgingBucket = "0-30" | "31-60" | "61-90" | "91-120" | "120+";

export const BUCKET_ORDER: AgingBucket[] = [
  "0-30",
  "31-60",
  "61-90",
  "91-120",
  "120+",
];

export interface AgedClaim {
  id: string;
  ageDays: number;
  bucket: AgingBucket;
  balanceCents: number;
  insuranceBalanceCents: number;
  patientBalanceCents: number;
  payerName: string | null;
  status: string;
  serviceDate: Date;
}

export interface AgingTotals {
  total: number;
  insurance: number;
  patient: number;
  byBucket: Record<AgingBucket, { total: number; insurance: number; patient: number }>;
}

export function bucketForDays(days: number): AgingBucket {
  if (days <= 30) return "0-30";
  if (days <= 60) return "31-60";
  if (days <= 90) return "61-90";
  if (days <= 120) return "91-120";
  return "120+";
}

export function computeAge(serviceDate: Date): number {
  return Math.floor(
    (Date.now() - serviceDate.getTime()) / (1000 * 60 * 60 * 24),
  );
}

/**
 * Convert raw Prisma claims into aging structures.
 * - Insurance A/R = balance still expected from payer (submitted/pending/denied)
 * - Patient A/R = patient responsibility minus patient payments
 */
export function ageClaims(
  claims: Array<{
    id: string;
    serviceDate: Date;
    status: string;
    payerName: string | null;
    billedAmountCents: number;
    paidAmountCents: number;
    patientRespCents: number;
    payments: Array<{ source: string; amountCents: number }>;
  }>,
): { aged: AgedClaim[]; totals: AgingTotals } {
  const aged: AgedClaim[] = [];
  const totals: AgingTotals = {
    total: 0,
    insurance: 0,
    patient: 0,
    byBucket: BUCKET_ORDER.reduce(
      (acc, b) => {
        acc[b] = { total: 0, insurance: 0, patient: 0 };
        return acc;
      },
      {} as Record<AgingBucket, { total: number; insurance: number; patient: number }>,
    ),
  };

  for (const claim of claims) {
    // Skip closed-out claims
    if (claim.status === "paid" && claim.patientRespCents === 0) continue;
    if (claim.status === "written_off") continue;

    const days = computeAge(claim.serviceDate);
    const bucket = bucketForDays(days);

    // Insurance still owes anything not yet paid by them, when in transit
    let insuranceBalanceCents = 0;
    if (
      claim.status === "submitted" ||
      claim.status === "accepted" ||
      claim.status === "adjudicated" ||
      claim.status === "denied" ||
      claim.status === "appealed"
    ) {
      const insurancePaid = claim.payments
        .filter((p) => p.source === "insurance")
        .reduce((a, p) => a + p.amountCents, 0);
      insuranceBalanceCents = Math.max(0, claim.billedAmountCents - insurancePaid - claim.patientRespCents);
    }

    // Patient owes their resp minus their payments
    const patientPaid = claim.payments
      .filter((p) => p.source === "patient")
      .reduce((a, p) => a + p.amountCents, 0);
    const patientBalanceCents = Math.max(0, claim.patientRespCents - patientPaid);

    const balanceCents = insuranceBalanceCents + patientBalanceCents;
    if (balanceCents === 0) continue;

    aged.push({
      id: claim.id,
      ageDays: days,
      bucket,
      balanceCents,
      insuranceBalanceCents,
      patientBalanceCents,
      payerName: claim.payerName,
      status: claim.status,
      serviceDate: claim.serviceDate,
    });

    totals.total += balanceCents;
    totals.insurance += insuranceBalanceCents;
    totals.patient += patientBalanceCents;
    totals.byBucket[bucket].total += balanceCents;
    totals.byBucket[bucket].insurance += insuranceBalanceCents;
    totals.byBucket[bucket].patient += patientBalanceCents;
  }

  // Sort by age descending — oldest first (highest priority)
  aged.sort((a, b) => b.ageDays - a.ageDays);

  return { aged, totals };
}

/**
 * Recoverability score 0-100. Higher = more likely to collect.
 * Used to rank work queues — high balance + low recoverability gets
 * the most senior biller.
 */
export function recoverabilityScore(claim: AgedClaim): number {
  let score = 100;
  // Older claims are harder to collect
  if (claim.ageDays > 120) score -= 50;
  else if (claim.ageDays > 90) score -= 30;
  else if (claim.ageDays > 60) score -= 15;
  // Denied claims are harder
  if (claim.status === "denied") score -= 20;
  return Math.max(0, score);
}

export function daysInAR(claims: Array<{ serviceDate: Date; status: string }>): number {
  // Simplified DAR: average age of claims still in A/R (non-terminal status).
  // NB: this is status-based, not balance-based — a claim that's been paid to
  // a $0 balance but not yet marked "paid" still counts. (The prior
  // `patientRespCents >= 0` guard was a no-op — cents are never negative — so
  // it filtered nothing; dropped it rather than imply a balance check that
  // isn't possible without payment data on the input.)
  const open = claims.filter(
    (c) => c.status !== "paid" && c.status !== "written_off",
  );
  if (open.length === 0) return 0;
  const totalDays = open.reduce((acc, c) => acc + computeAge(c.serviceDate), 0);
  return Math.round(totalDays / open.length);
}
