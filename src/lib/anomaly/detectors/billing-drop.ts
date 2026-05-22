// EMR-737 — Billing drop detector.
//
// Per organization, compares `Claim.billedAmountCents` summed over the
// current 7-day window against the prior 7-day window. Flags an anomaly
// when this-week total has dropped ≥ 30% (WARNING) or ≥ 60% (CRITICAL)
// versus prior week.
//
// "New practice" guard: if `prevWeekTotal === 0` we skip emission — there
// is nothing to compare against and we don't want to flag every newly-
// onboarded practice as a billing collapse.
//
// Idempotency key: `billing_drop:${orgId}:${weekStartISO}`. weekStart is
// the UTC midnight at the beginning of the current 7-day window so the
// same drop on the same week collapses to a single row.
//
// PHI: none. `context` is org-scoped totals and percent — no patient or
// claim line-item detail flows through.

import type { PrismaClient } from "@prisma/client";

import type { AnomalyDetector, AnomalyEmission } from "../framework";

const WARNING_DROP_PCT = 30;
const CRITICAL_DROP_PCT = 60;
const TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

const DAY_MS = 24 * 60 * 60 * 1000;

/** ISO date for the start of the current 7-day window (UTC midnight). */
function weekBucket(now: Date): string {
  const start = new Date(now.getTime() - 7 * DAY_MS);
  return start.toISOString().slice(0, 10);
}

export const billingDropDetector: AnomalyDetector = {
  slug: "billing_drop",
  async run(prisma: PrismaClient): Promise<AnomalyEmission[]> {
    const now = new Date();
    const recentSince = new Date(now.getTime() - 7 * DAY_MS);
    const priorSince = new Date(now.getTime() - 14 * DAY_MS);

    // Group both windows by organizationId in a single aggregate per
    // window. Anything that didn't bill in either window is excluded
    // because Prisma groupBy only returns rows present in the filter.
    const recentGroups = await prisma.claim.groupBy({
      by: ["organizationId"],
      where: {
        serviceDate: { gte: recentSince, lte: now },
      },
      _sum: { billedAmountCents: true },
    });

    const priorGroups = await prisma.claim.groupBy({
      by: ["organizationId"],
      where: {
        serviceDate: { gte: priorSince, lt: recentSince },
      },
      _sum: { billedAmountCents: true },
    });

    const priorByOrg = new Map<string, number>();
    for (const g of priorGroups) {
      priorByOrg.set(g.organizationId, g._sum.billedAmountCents ?? 0);
    }
    const recentByOrg = new Map<string, number>();
    for (const g of recentGroups) {
      recentByOrg.set(g.organizationId, g._sum.billedAmountCents ?? 0);
    }

    const bucket = weekBucket(now);
    const emissions: AnomalyEmission[] = [];

    // Iterate organizations that have *prior* data; new practices are
    // intentionally skipped per the "prevWeekTotal === 0 → skip" guard.
    for (const [orgId, prevTotal] of priorByOrg) {
      if (prevTotal <= 0) continue;
      const currentTotal = recentByOrg.get(orgId) ?? 0;
      const dropPct = ((prevTotal - currentTotal) / prevTotal) * 100;
      if (dropPct < WARNING_DROP_PCT) continue;

      const severity = dropPct >= CRITICAL_DROP_PCT ? "critical" : "warning";
      const idempotencyKey = `billing_drop:${orgId}:${bucket}`;
      emissions.push({
        slug: `billing-drop-${orgId}-${bucket}`,
        idempotencyKey,
        severity,
        practiceId: orgId,
        message: `Practice ${orgId} billing dropped ${dropPct.toFixed(1)}% week-over-week`,
        deeplinkUrl: `/admin/practices/${orgId}`,
        context: {
          organizationId: orgId,
          currentWeekTotalCents: currentTotal,
          priorWeekTotalCents: prevTotal,
          dropPct: Number(dropPct.toFixed(2)),
          weekBucket: bucket,
        },
        ttlSeconds: TTL_SECONDS,
      });
    }
    return emissions;
  },
};
