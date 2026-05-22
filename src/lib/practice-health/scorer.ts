// EMR-732 — Per-practice composite health scorer.
//
// Computes a 0–100 composite score per organization from four
// independent signals. Each sub-metric is its own pure exported
// function so it can be unit-tested in isolation. The composite is a
// weighted average rounded to an integer and clamped to [0, 100].
//
// Weighting:
//   publish        30%  — is the practice live and not stuck mid-publish?
//   agentErrors    25%  — are agents quietly erroring out over the last day?
//   billing        30%  — is the practice's claim volume trending healthy?
//   loginFailures  15%  — are users locked out / under attack?
//
// HQ score-to-color thresholds (consumed by E1 dashboard):
//   green   ≥ 80
//   yellow  60 – 79
//   orange  40 – 59
//   red     < 40
//
// PHI posture: returns counts, rates, and integer subscores only.
// No names, no patient IDs, no claim numbers. The cron is responsible
// for persisting the breakdown verbatim — keep this contract stable;
// the HQ dashboard (E1) reads `breakdown.*` keys directly.

import type { PrismaClient } from "@prisma/client";

/**
 * Weights for each sub-metric. MUST sum to 100. Asserted in the unit
 * test for this module — do not edit one without re-balancing the
 * others.
 */
export const WEIGHTS = {
  publish: 30,
  agentErrors: 25,
  billing: 30,
  loginFailures: 15,
} as const;

export type Breakdown = {
  publish: number;
  agentErrors: number;
  billing: number;
  loginFailures: number;
};

export type PracticeHealthResult = {
  score: number;
  breakdown: Breakdown;
};

/**
 * Anything that quacks like a Prisma client for the three models this
 * scorer touches. Narrowed (vs `PrismaClient`) so tests can stub it
 * without recreating the full client surface.
 */
export type PrismaLike = Pick<
  PrismaClient,
  "practiceConfiguration" | "controllerAuditLog" | "claim"
>;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Clamp `value` to the closed interval [min, max].
 */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.max(min, Math.min(max, value));
}

/**
 * Publish-health subscore.
 *
 *   published & updated within the last 24h    → 100
 *   published but `updatedAt` > 24h ago        → 100 (steady-state live)
 *   draft / non-terminal & updated > 24h ago   → 50  (stuck mid-publish)
 *   draft (recent)                             → 30
 *   no configuration at all                    → 0
 *
 * "Stuck mid-publish" means the configuration is in a non-terminal
 * state (draft) and hasn't moved in over 24 hours. Practices that have
 * been deliberately archived score 0 — they shouldn't be live.
 */
export async function scorePublishHealth(
  prisma: PrismaLike,
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  const config = await prisma.practiceConfiguration.findFirst({
    where: { organizationId },
    orderBy: { updatedAt: "desc" },
    select: { status: true, updatedAt: true },
  });

  if (!config) return 0;
  if (config.status === "archived") return 0;

  const ageMs = now.getTime() - new Date(config.updatedAt).getTime();
  const stale = ageMs > DAY_MS;

  if (config.status === "published") {
    // Steady-state live is fine; only published-but-stuck is suspect,
    // and we don't have a "publishing" intermediate state in v1.
    return 100;
  }

  // status === "draft"
  if (stale) return 50;
  return 30;
}

/**
 * Agent error-rate subscore.
 *
 * Counts `ControllerAuditLog` rows in the last 24h scoped to this org
 * whose `action` ends with `.error`. Buckets:
 *
 *   ≤ 2   → 100
 *   ≤ 10  → 70
 *   ≤ 30  → 40
 *   > 30  → 10
 */
export async function scoreAgentErrorRate(
  prisma: PrismaLike,
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  const since = new Date(now.getTime() - DAY_MS);

  const count = await prisma.controllerAuditLog.count({
    where: {
      organizationId,
      at: { gte: since },
      action: { endsWith: ".error" },
    },
  });

  if (count <= 2) return 100;
  if (count <= 10) return 70;
  if (count <= 30) return 40;
  return 10;
}

/**
 * Billing-trend subscore.
 *
 * Compares `Claim.billedAmountCents` summed over the last 7 days
 * against the prior 7-day window (days 8–14).
 *
 *   growth   ≥   0%  → 100
 *   drop     ≤  10%  → 80
 *   drop     ≤  30%  → 50
 *   drop     ≤  60%  → 25
 *   drop     >  60%  → 0
 *
 * Edge case: if the prior window is zero (new practice, no claims
 * yet), we return 100 — we don't have enough signal to call it
 * unhealthy.
 */
export async function scoreBillingTrend(
  prisma: PrismaLike,
  organizationId: string,
  now: Date = new Date(),
): Promise<number> {
  const recentSince = new Date(now.getTime() - 7 * DAY_MS);
  const priorSince = new Date(now.getTime() - 14 * DAY_MS);
  const priorUntil = recentSince;

  const [recent, prior] = await Promise.all([
    prisma.claim.aggregate({
      where: {
        organizationId,
        serviceDate: { gte: recentSince, lte: now },
      },
      _sum: { billedAmountCents: true },
    }),
    prisma.claim.aggregate({
      where: {
        organizationId,
        serviceDate: { gte: priorSince, lt: priorUntil },
      },
      _sum: { billedAmountCents: true },
    }),
  ]);

  const recentTotal = recent._sum.billedAmountCents ?? 0;
  const priorTotal = prior._sum.billedAmountCents ?? 0;

  if (priorTotal === 0) return 100;

  const delta = (recentTotal - priorTotal) / priorTotal;
  if (delta >= 0) return 100;

  const dropPct = -delta;
  if (dropPct <= 0.1) return 80;
  if (dropPct <= 0.3) return 50;
  if (dropPct <= 0.6) return 25;
  return 0;
}

/**
 * Login-failure-rate subscore.
 *
 * NOTE(EMR-732 follow-up): there is no first-class auth-failure log
 * in the schema yet. Until one lands we return a constant baseline
 * of 100 — assuming healthy until proven otherwise. The PR body
 * tracks this as a follow-up so the gap is visible.
 */
export async function scoreLoginFailureRate(
  _prisma: PrismaLike,
  _organizationId: string,
  _now: Date = new Date(),
): Promise<number> {
  return 100;
}

/**
 * Compose the four sub-metrics into a single 0–100 score, rounded
 * and clamped. Pure: makes no DB writes; just reads via the four
 * sub-metric helpers above. The cron is responsible for persisting.
 */
export async function computePracticeHealth(
  prisma: PrismaLike,
  organizationId: string,
  now: Date = new Date(),
): Promise<PracticeHealthResult> {
  const [publish, agentErrors, billing, loginFailures] = await Promise.all([
    scorePublishHealth(prisma, organizationId, now),
    scoreAgentErrorRate(prisma, organizationId, now),
    scoreBillingTrend(prisma, organizationId, now),
    scoreLoginFailureRate(prisma, organizationId, now),
  ]);

  const weighted =
    (publish * WEIGHTS.publish +
      agentErrors * WEIGHTS.agentErrors +
      billing * WEIGHTS.billing +
      loginFailures * WEIGHTS.loginFailures) /
    100;

  const score = clamp(Math.round(weighted), 0, 100);

  return {
    score,
    breakdown: { publish, agentErrors, billing, loginFailures },
  };
}
