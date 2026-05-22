// EMR-730 — Per-actor mutation budget alarm: pure helpers.
//
// This module contains the threshold parser and the two windowing /
// dedupe predicates that the cron route at
// /api/cron/mutation-budget-sweep wires together. Splitting it out keeps
// the cron handler thin and lets the unit tests exercise the logic
// without standing up Next.js, Prisma, or a clock.
//
// Defaults match the AC on EMR-730:
//   - >30 mutations/min  → fire
//   - >100 mutations/5min → fire
//   - 10-minute dedupe window per actor
//
// Env knobs (read at boot via `loadThresholds()`):
//   - SUPER_ADMIN_ALARM_PER_MIN    (default 30)
//   - SUPER_ADMIN_ALARM_PER_5MIN   (default 100)
//
// "Boot" = the first time the cron route is invoked in this process.
// Bad env values fall back to the default and log a structured warning
// so ops sees the misconfiguration without the cron silently turning
// itself off.

import type { Logger } from "@/lib/observability/log";

export const DEFAULT_PER_MIN = 30;
export const DEFAULT_PER_5MIN = 100;
export const DEDUPE_WINDOW_MS = 10 * 60 * 1_000; // 10 minutes
export const SWEEP_WINDOW_MS = 5 * 60 * 1_000; // 5 minutes
export const ONE_MIN_MS = 60 * 1_000;

export interface BudgetThresholds {
  perMin: number;
  per5Min: number;
}

/**
 * Parse the two env vars into integer thresholds. Returns defaults +
 * emits a structured warning when a value is missing, non-numeric, or
 * <= 0. Refusing to fire (parsing to NaN and silently disabling the
 * cron) is the failure mode we explicitly do not want.
 */
export function loadThresholds(
  env: Partial<Record<string, string | undefined>> = process.env,
  log?: Pick<Logger, "warn">,
): BudgetThresholds {
  const perMin = parsePositiveInt(env.SUPER_ADMIN_ALARM_PER_MIN, DEFAULT_PER_MIN, "SUPER_ADMIN_ALARM_PER_MIN", log);
  const per5Min = parsePositiveInt(env.SUPER_ADMIN_ALARM_PER_5MIN, DEFAULT_PER_5MIN, "SUPER_ADMIN_ALARM_PER_5MIN", log);
  return { perMin, per5Min };
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  envKey: string,
  log?: Pick<Logger, "warn">,
): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    log?.warn({
      event: "mutation_budget.threshold_unparseable",
      envKey,
      raw,
      fallback,
    });
    return fallback;
  }
  return n;
}

/**
 * Audit-log row shape this module needs. Narrowed so the test harness
 * can hand-roll fixtures without depending on Prisma's generated types.
 */
export interface AuditRow {
  at: Date;
  actorUserId: string;
  actorEmail: string | null;
  action: string;
}

export interface ActorWindowCounts {
  actorUserId: string;
  actorEmail: string | null;
  perMin: number;
  per5Min: number;
  sampleActions: string[];
}

/**
 * Aggregate audit rows into per-actor counts over the 1-minute and
 * 5-minute windows ending at `now`. The 5-min window is the upper
 * bound; the 1-min window is a strict subset.
 *
 * `sampleActions` is the last 5 distinct action strings seen for the
 * actor inside the 5-minute window (most-recent first), included in the
 * structured alarm payload so on-call can eyeball what kind of activity
 * tripped the budget.
 */
export function aggregatePerActor(
  rows: readonly AuditRow[],
  now: Date,
): Map<string, ActorWindowCounts> {
  const cutoff5 = now.getTime() - SWEEP_WINDOW_MS;
  const cutoff1 = now.getTime() - ONE_MIN_MS;

  const acc = new Map<string, ActorWindowCounts>();
  // Iterate in reverse-chronological order so the first 5 distinct
  // actions we observe per actor are the most-recent ones.
  const sorted = [...rows].sort((a, b) => b.at.getTime() - a.at.getTime());

  for (const row of sorted) {
    const t = row.at.getTime();
    if (t < cutoff5) continue;

    let entry = acc.get(row.actorUserId);
    if (!entry) {
      entry = {
        actorUserId: row.actorUserId,
        actorEmail: row.actorEmail,
        perMin: 0,
        per5Min: 0,
        sampleActions: [],
      };
      acc.set(row.actorUserId, entry);
    }
    // Carry the first non-null email we see — older rows may have it
    // even if a more-recent one doesn't.
    if (!entry.actorEmail && row.actorEmail) entry.actorEmail = row.actorEmail;

    entry.per5Min += 1;
    if (t >= cutoff1) entry.perMin += 1;

    if (entry.sampleActions.length < 5 && !entry.sampleActions.includes(row.action)) {
      entry.sampleActions.push(row.action);
    }
  }

  return acc;
}

/**
 * True when the actor's counts exceed either threshold.
 */
export function exceedsBudget(counts: ActorWindowCounts, thresholds: BudgetThresholds): boolean {
  return counts.perMin > thresholds.perMin || counts.per5Min > thresholds.per5Min;
}

/**
 * Dedupe predicate. `lastAlertedAt` is the most-recent fire we have on
 * record for the actor (or `null` if there's never been one). Returns
 * true when we should suppress the alarm because we already fired
 * within `DEDUPE_WINDOW_MS`.
 */
export function isSuppressedByDedupe(lastAlertedAt: Date | null, now: Date): boolean {
  if (!lastAlertedAt) return false;
  return now.getTime() - lastAlertedAt.getTime() < DEDUPE_WINDOW_MS;
}
