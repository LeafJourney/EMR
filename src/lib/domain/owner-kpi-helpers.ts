// ---------------------------------------------------------------------------
// Owner KPIs — Client-safe helpers and types (free of database dependencies)
// ---------------------------------------------------------------------------

export interface OwnerKpiSnapshot {
  revenueThisWeekCents: number;
  revenuePriorWeekCents: number;
  denials: { unresolvedCount: number; oldestDays: number | null };
  scheduleFillPct: number | null;
  visitsToday: number;
  openSlotsToday: number;
  agents: { running: number; completedToday: number };
  newPatientsThisWeek: number;
  newPatientsPriorWeek: number;
  arAgingCents: number;
  arPastDueCount: number;
}

export type Trend = "up" | "down" | "flat";

export interface TrendResult {
  direction: Trend;
  /** Percent change vs prior, e.g. 12.3 means +12.3%. null when prior is 0. */
  percent: number | null;
}

/**
 * Compute trend direction + percent delta vs prior period.
 * Treats both zero as "flat". When prior is 0 and current > 0, returns
 * direction "up" with percent null (cannot compute % change from zero).
 */
export function computeTrend(current: number, prior: number): TrendResult {
  if (current === prior) return { direction: "flat", percent: 0 };
  if (prior === 0) {
    return { direction: current > 0 ? "up" : "down", percent: null };
  }
  const pct = ((current - prior) / prior) * 100;
  return {
    direction: pct > 0 ? "up" : pct < 0 ? "down" : "flat",
    percent: Math.round(pct * 10) / 10,
  };
}

export type Severity = "good" | "warn" | "bad";

export interface DenialSeverityInput {
  oldestDays: number | null;
  unresolvedCount: number;
}

/**
 * Severity tier for the denials queue.
 * - bad:   any denial older than 30 days
 * - warn:  any denial older than 14 days
 * - good:  otherwise (including no denials at all)
 */
export function denialSeverity({ oldestDays, unresolvedCount }: DenialSeverityInput): Severity {
  if (unresolvedCount === 0 || oldestDays === null) return "good";
  if (oldestDays > 30) return "bad";
  if (oldestDays > 14) return "warn";
  return "good";
}

export interface ArSeverityInput {
  arAgingCents: number;
  /** Days since the OLDEST past-due claim was submitted (null if none). */
  oldestPastDueDays: number | null;
}

/**
 * Severity tier for AR aging.
 * - bad:   > $10k outstanding OR oldest past-due > 60 days
 * - warn:  any past-due (anything > 30 days)
 * - good:  no past-due claims
 */
export function arSeverity({ arAgingCents, oldestPastDueDays }: ArSeverityInput): Severity {
  if (oldestPastDueDays === null) return "good";
  if (arAgingCents > 1_000_000 || oldestPastDueDays > 60) return "bad";
  return "warn";
}
