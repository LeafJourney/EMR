/**
 * RCM daily-close report — EMR-230
 * --------------------------------
 * Operations needs a single daily view: how much was billed, collected,
 * outstanding, aged, appealed, written off. Today the data is spread
 * across 15 agents with no dashboard.
 *
 * Pipeline:
 *   - `aggregateClose` collapses a day's worth of claim/payment/appeal
 *     events into the metrics tile bag.
 *   - `findExceptions` produces the live exception list (stale claims,
 *     unbalanced batches, pending takebacks, unmatched deposits,
 *     overdue appeals).
 *   - `dailyDigestText` turns the row into the email body.
 *
 *  Pure module — runs over plain row arrays so the daily-close cron
 *  job (in the agent layer) can hand it Prisma reads without dragging
 *  the DB into tests.
 */

import { formatMoney } from "@/lib/domain/billing";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface CloseInputs {
  closeDate: Date;
  /** All claims with at least one event in the close window. */
  claims: Array<{
    id: string;
    status: string;
    /** When the claim row was created (= when it was billed). Drives the
     *  "created"/"billed" metrics — NOT serviceDate, which can be weeks
     *  earlier and would land the dollars on a day whose close already ran. */
    createdAt: Date;
    serviceDate: Date;
    submittedAt: Date | null;
    paidAt: Date | null;
    deniedAt: Date | null;
    closedAt: Date | null;
    closureType: string | null;
    billedAmountCents: number;
    allowedAmountCents: number | null;
    paidAmountCents: number;
    patientRespCents: number;
    timelyFilingDeadline: Date | null;
  }>;
  /** Actual payments posted, used for same-day cash attribution. The daily
   *  "collected" figure is the sum of these by paymentDate — NOT the claim's
   *  cumulative paidAmountCents gated on paidAt, which mis-dates partial pays
   *  and drops earlier payments when paidAt is overwritten. */
  payments: Array<{ amountCents: number; source: string; paymentDate: Date }>;
  /** Adjustments posted during the window (signed cents). */
  adjustments: Array<{ type: string; amountCents: number; createdAt: Date; postedAt: Date | null }>;
  /** AR snapshot at close. */
  arBuckets: { b0_30: number; b31_60: number; b61_90: number; b91_120: number; b120plus: number };
  /** ERA files received during the window. */
  eraFiles: Array<{ id: string; receivedAt: Date; status: string }>;
  /** Bank deposits in window. */
  bankDeposits: Array<{ id: string; status: string }>;
  /** Appeal packets that should have heard back by now. */
  appealPackets: Array<{ id: string; status: string; submittedAt: Date | null }>;
  /** Bank reconciliation pending takebacks. */
  pendingTakebacks: Array<{ id: string; amountCents: number }>;
}

export interface CloseRow {
  closeDate: Date;
  claimsCreated: number;
  claimsSubmitted: number;
  claimsAccepted: number;
  claimsRejected: number;
  claimsPaid: number;
  claimsDenied: number;
  claimsAppealed: number;
  claimsWrittenOff: number;
  billedCents: number;
  allowedCents: number;
  paidCents: number;
  adjustmentCents: number;
  patientRespCents: number;
  outstandingArCents: number;
  arBucket0to30: number;
  arBucket31to60: number;
  arBucket61to90: number;
  arBucket91to120: number;
  arBucket120plus: number;
  staleClaims: number;
  unbalancedBatches: number;
  pendingTakebacks: number;
  unmatchedDeposits: number;
  overdueAppeals: number;
}

export interface CloseException {
  kind: "stale_claim" | "unbalanced_batch" | "pending_takeback" | "unmatched_deposit" | "overdue_appeal";
  ref: string; // record id
  detail: string;
  ageDays: number;
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

const STALE_CLAIM_THRESHOLD_DAYS = 30;
const OVERDUE_APPEAL_THRESHOLD_DAYS = 45;

/** Roll up the day's data into a CloseRow. Idempotent — running it
 *  twice for the same day produces the same numbers (caller upserts on
 *  `[organizationId, closeDate]`). */
export function aggregateClose(input: CloseInputs): CloseRow {
  const onDay = (d: Date | null) => d != null && sameUtcDay(d, input.closeDate);
  // "created"/"billed" key off createdAt (when the claim was billed), not
  // serviceDate (the date of care, which may be weeks earlier).
  const created = input.claims.filter((c) => onDay(c.createdAt)).length;
  const submitted = input.claims.filter((c) => onDay(c.submittedAt)).length;
  const paid = input.claims.filter((c) => onDay(c.paidAt)).length;
  const denied = input.claims.filter((c) => onDay(c.deniedAt)).length;
  const writtenOff = input.claims.filter(
    (c) => onDay(c.closedAt) && c.closureType === "written_off",
  ).length;
  const accepted = input.claims.filter(
    (c) => c.status === "accepted" || c.status === "adjudicated" || c.status === "paid",
  ).length;
  const rejected = input.claims.filter((c) => c.status === "rejected").length;
  const appealed = input.claims.filter((c) => c.status === "appealed").length;

  const billedCents = input.claims.reduce(
    (a, c) => a + (onDay(c.createdAt) ? c.billedAmountCents : 0),
    0,
  );
  const allowedCents = input.claims.reduce(
    (a, c) => a + (onDay(c.paidAt) ? c.allowedAmountCents ?? 0 : 0),
    0,
  );
  // Cash collected = actual payments by paymentDate (insurance + patient),
  // excluding non-cash "adjustment" source. This reconciles to the bank,
  // unlike the claim's cumulative paidAmountCents gated on paidAt.
  const paidCents = input.payments.reduce(
    (a, p) => a + (p.source !== "adjustment" && onDay(p.paymentDate) ? p.amountCents : 0),
    0,
  );
  const patientRespCents = input.claims.reduce(
    (a, c) => a + (onDay(c.paidAt) ? c.patientRespCents : 0),
    0,
  );
  const adjustmentCents = input.adjustments
    .filter((a) => onDay(a.postedAt ?? a.createdAt))
    .reduce((a, x) => a + x.amountCents, 0);

  const outstandingAr =
    input.arBuckets.b0_30 +
    input.arBuckets.b31_60 +
    input.arBuckets.b61_90 +
    input.arBuckets.b91_120 +
    input.arBuckets.b120plus;

  const exceptions = findExceptions(input);
  const counts = {
    stale_claim: 0,
    unbalanced_batch: 0,
    pending_takeback: 0,
    unmatched_deposit: 0,
    overdue_appeal: 0,
  };
  for (const e of exceptions) counts[e.kind]++;

  return {
    closeDate: input.closeDate,
    claimsCreated: created,
    claimsSubmitted: submitted,
    claimsAccepted: accepted,
    claimsRejected: rejected,
    claimsPaid: paid,
    claimsDenied: denied,
    claimsAppealed: appealed,
    claimsWrittenOff: writtenOff,
    billedCents,
    allowedCents,
    paidCents,
    adjustmentCents,
    patientRespCents,
    outstandingArCents: outstandingAr,
    arBucket0to30: input.arBuckets.b0_30,
    arBucket31to60: input.arBuckets.b31_60,
    arBucket61to90: input.arBuckets.b61_90,
    arBucket91to120: input.arBuckets.b91_120,
    arBucket120plus: input.arBuckets.b120plus,
    staleClaims: counts.stale_claim,
    unbalancedBatches: counts.unbalanced_batch,
    pendingTakebacks: counts.pending_takeback,
    unmatchedDeposits: counts.unmatched_deposit,
    overdueAppeals: counts.overdue_appeal,
  };
}

// ---------------------------------------------------------------------------
// Exceptions
// ---------------------------------------------------------------------------

export function findExceptions(input: CloseInputs): CloseException[] {
  const out: CloseException[] = [];
  const now = input.closeDate;

  // Stale claims — submitted but not adjudicated within payer SLA proxy.
  for (const c of input.claims) {
    if (!c.submittedAt) continue;
    if (c.paidAt || c.deniedAt) continue;
    const age = daysBetween(c.submittedAt, now);
    if (age >= STALE_CLAIM_THRESHOLD_DAYS) {
      out.push({
        kind: "stale_claim",
        ref: c.id,
        detail: `submitted ${age}d ago, no adjudication response`,
        ageDays: age,
      });
    }
  }

  // Pending takebacks — adjustment rows that were created but never posted.
  for (const t of input.pendingTakebacks) {
    out.push({
      kind: "pending_takeback",
      ref: t.id,
      detail: `${formatMoney(Math.abs(t.amountCents))} takeback unposted`,
      ageDays: 0,
    });
  }

  // Unmatched deposits.
  for (const d of input.bankDeposits) {
    if (d.status === "unmatched" || d.status === "partially_matched" || d.status === "variance") {
      out.push({
        kind: "unmatched_deposit",
        ref: d.id,
        detail: `bank deposit status=${d.status}`,
        ageDays: 0,
      });
    }
  }

  // Overdue appeals — submitted but no response past threshold.
  for (const a of input.appealPackets) {
    if (a.status !== "submitted" || !a.submittedAt) continue;
    const age = daysBetween(a.submittedAt, now);
    if (age >= OVERDUE_APPEAL_THRESHOLD_DAYS) {
      out.push({
        kind: "overdue_appeal",
        ref: a.id,
        detail: `appeal submitted ${age}d ago, no response`,
        ageDays: age,
      });
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Email digest
// ---------------------------------------------------------------------------

/** Plain-text digest sent to the practice owner the morning after
 *  close. The HTML version (used in EMR-211 reminder pipeline) wraps
 *  the same content with brand styling. */
export function dailyDigestText(row: CloseRow, exceptions: CloseException[]): string {
  const date = row.closeDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const lines: string[] = [
    `Daily RCM close — ${date}`,
    ``,
    `Activity:`,
    `  Created   ${row.claimsCreated}`,
    `  Submitted ${row.claimsSubmitted}`,
    `  Paid      ${row.claimsPaid}    ${formatMoney(row.paidCents)}`,
    `  Denied    ${row.claimsDenied}`,
    `  Written-off ${row.claimsWrittenOff}`,
    ``,
    `Money in window:`,
    `  Billed     ${formatMoney(row.billedCents)}`,
    `  Allowed    ${formatMoney(row.allowedCents)}`,
    `  Adjustments ${formatMoney(row.adjustmentCents)}`,
    `  Patient resp ${formatMoney(row.patientRespCents)}`,
    ``,
    `AR by bucket:`,
    `  0-30   ${formatMoney(row.arBucket0to30)}`,
    `  31-60  ${formatMoney(row.arBucket31to60)}`,
    `  61-90  ${formatMoney(row.arBucket61to90)}`,
    `  91-120 ${formatMoney(row.arBucket91to120)}`,
    `  120+   ${formatMoney(row.arBucket120plus)}`,
    `  Total  ${formatMoney(row.outstandingArCents)}`,
    ``,
  ];
  if (exceptions.length === 0) {
    lines.push(`No exceptions today. Clean close.`);
  } else {
    lines.push(`Exceptions (${exceptions.length}):`);
    for (const e of exceptions.slice(0, 20)) {
      lines.push(`  · [${e.kind}] ${e.ref} — ${e.detail}`);
    }
    if (exceptions.length > 20) {
      lines.push(`  · …and ${exceptions.length - 20} more.`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sameUtcDay(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() === b.getUTCMonth() &&
    a.getUTCDate() === b.getUTCDate()
  );
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}
