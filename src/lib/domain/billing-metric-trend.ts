// ---------------------------------------------------------------------------
// Billing metric trends (Dr. Patel directive — billing).
//
// Reconstructs a month-to-month cumulative series for a balance/breakdown
// metric from the patient's FinancialEvent ledger. The contribution of each
// event type to each metric is defined *explicitly* (direction × |amount|), so
// the running total is correct by construction regardless of how the event's
// own sign was stored upstream.
//
// Pure + dependency-free (no prisma, no formatting) so it is unit-testable and
// safe to call from a server component.
// ---------------------------------------------------------------------------

export type MetricKey =
  | "total_balance"
  | "patient_due"
  | "insurance_pending"
  | "overdue"
  | "copay_collected"
  | "patient_responsibility";

export interface TrendEvent {
  id: string;
  /** FinancialEventType value. */
  type: string;
  /** Raw signed cents as stored on the event. */
  amountCents: number;
  occurredAt: Date;
  description: string;
}

export interface TrendPoint {
  /** "YYYY-MM" sort key. */
  monthKey: string;
  /** Display label, e.g. "May '26". */
  label: string;
  /** Cumulative running value for this metric, in cents, at month end. */
  cumulativeCents: number;
}

export interface TrendLineItem {
  id: string;
  description: string;
  occurredAt: Date;
  /** Signed contribution to this metric in cents (+ raises the metric). */
  signedCents: number;
}

export interface MetricTrend {
  points: TrendPoint[];
  /** Contributing events, most recent first. */
  lineItems: TrendLineItem[];
}

// Direction of each event type's contribution to a metric. Magnitude is always
// |amountCents|; the sign here decides whether the event raises (+1) or lowers
// (-1) the metric. Types absent from a map contribute nothing.
const PATIENT_LEDGER: Record<string, 1 | -1> = {
  patient_responsibility_transferred: 1,
  copay_assessed: 1,
  patient_payment: -1,
  copay_collected: -1,
  credit_applied: -1,
  write_off: -1,
};

const DIRECTION: Record<MetricKey, Record<string, 1 | -1>> = {
  // Everything the account owes: charges up, money in / adjustments down.
  total_balance: {
    charge_created: 1,
    charge_voided: -1,
    insurance_paid: -1,
    patient_payment: -1,
    copay_collected: -1,
    contractual_adjustment: -1,
    write_off: -1,
    credit_applied: -1,
    refund_issued: 1,
  },
  // Patient-owed ledger (shared by patient_due / overdue / patient_responsibility).
  patient_due: PATIENT_LEDGER,
  overdue: PATIENT_LEDGER,
  patient_responsibility: PATIENT_LEDGER,
  // Insurance side: submission makes it pending, payment/denial/adjustment clears it.
  insurance_pending: {
    claim_submitted: 1,
    insurance_paid: -1,
    claim_denied: -1,
    contractual_adjustment: -1,
  },
  // Pure cumulative inflow — ends at total copay collected.
  copay_collected: {
    copay_collected: 1,
  },
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function monthKeyOf(d: Date): string {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}`;
}

function labelOf(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return `${MONTHS[m - 1]} '${String(y).slice(2)}`;
}

/** Enumerate every "YYYY-MM" from `first` to `last` inclusive. */
function monthRange(first: string, last: string): string[] {
  const [fy, fm] = first.split("-").map(Number);
  const [ly, lm] = last.split("-").map(Number);
  const out: string[] = [];
  let y = fy;
  let m = fm;
  // Bound the walk defensively so malformed input can never spin forever.
  for (let guard = 0; guard < 1200; guard++) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (y === ly && m === lm) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * Build the cumulative month-to-month series + contributing line items for a
 * single billing metric.
 */
export function buildMetricTrend(
  metric: MetricKey,
  events: TrendEvent[],
): MetricTrend {
  const dir = DIRECTION[metric];

  const items: TrendLineItem[] = [];
  for (const e of events) {
    const sign = dir[e.type];
    if (!sign) continue;
    const signedCents = sign * Math.abs(e.amountCents);
    if (signedCents === 0) continue;
    items.push({
      id: e.id,
      description: e.description,
      occurredAt: e.occurredAt,
      signedCents,
    });
  }

  if (items.length === 0) {
    return { points: [], lineItems: [] };
  }

  // Ascending for accumulation.
  const asc = [...items].sort(
    (a, b) => a.occurredAt.getTime() - b.occurredAt.getTime(),
  );

  // Sum contributions per month.
  const perMonth = new Map<string, number>();
  for (const it of asc) {
    const key = monthKeyOf(it.occurredAt);
    perMonth.set(key, (perMonth.get(key) ?? 0) + it.signedCents);
  }

  const firstKey = monthKeyOf(asc[0].occurredAt);
  const lastKey = monthKeyOf(asc[asc.length - 1].occurredAt);

  // Carry the running total forward across months with no activity so the
  // cumulative curve stays continuous.
  let running = 0;
  const points: TrendPoint[] = monthRange(firstKey, lastKey).map((key) => {
    running += perMonth.get(key) ?? 0;
    return { monthKey: key, label: labelOf(key), cumulativeCents: running };
  });

  return {
    points,
    lineItems: items.sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime(),
    ),
  };
}
