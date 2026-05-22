// EMR-737 — Stuck publish detector.
//
// Flags any `PracticeConfiguration` row whose `status` is non-terminal
// (i.e. still `draft`) and whose `updatedAt` is more than 24h old. The
// onboarding controller is supposed to drive every draft to `published`
// or `archived`; sitting in `draft` for >24h means a wizard step stalled,
// an admin walked away, or the publish path threw silently — all things
// fleet-ops should look at.
//
// Severity: WARNING. (Stuck != broken: super-admins triage, they don't
// page on it.)
//
// Idempotency: `stuck_publish:${configId}:${YYYY-MM-DD}`. The day bucket
// collapses repeated re-detection of the same stuck config on the same
// day to a single row. A config that's stuck for a week generates one row
// per day, which matches how the HQ feed wants to display it.
//
// PHI: none. `context` carries configId, status, hoursStuck, updatedAt
// only — no patient data ever flows through PracticeConfiguration.

import type { PrismaClient } from "@prisma/client";

import type { AnomalyDetector, AnomalyEmission } from "../framework";

/** Statuses considered "in motion" — anything outside this set is terminal. */
const NON_TERMINAL_STATUSES = ["draft"] as const;

/** Hours a draft must sit untouched before we flag it. */
const STUCK_THRESHOLD_HOURS = 24;

/** Per-anomaly TTL — one day. */
const TTL_SECONDS = 86400;

/** YYYY-MM-DD bucket in UTC; stable across timezones. */
function dayBucket(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export const stuckPublishDetector: AnomalyDetector = {
  slug: "stuck_publish",
  async run(prisma: PrismaClient): Promise<AnomalyEmission[]> {
    const now = new Date();
    const cutoff = new Date(
      now.getTime() - STUCK_THRESHOLD_HOURS * 60 * 60 * 1000,
    );

    const configs = await prisma.practiceConfiguration.findMany({
      where: {
        status: { in: NON_TERMINAL_STATUSES as unknown as ("draft")[] },
        updatedAt: { lt: cutoff },
      },
      select: {
        id: true,
        organizationId: true,
        practiceId: true,
        status: true,
        updatedAt: true,
      },
    });

    const emissions: AnomalyEmission[] = [];
    for (const config of configs) {
      const hoursStuck = Math.floor(
        (now.getTime() - config.updatedAt.getTime()) / (60 * 60 * 1000),
      );
      const bucket = dayBucket(config.updatedAt);
      const idempotencyKey = `stuck_publish:${config.id}:${bucket}`;
      emissions.push({
        slug: `stuck-publish-${config.id}-${bucket}`,
        idempotencyKey,
        severity: "warning",
        practiceId: config.practiceId,
        message: `Practice ${config.practiceId} has been in ${config.status} for ${hoursStuck}h`,
        deeplinkUrl: `/admin/practices/${config.organizationId}`,
        context: {
          configId: config.id,
          organizationId: config.organizationId,
          status: config.status,
          hoursStuck,
          updatedAt: config.updatedAt.toISOString(),
        },
        ttlSeconds: TTL_SECONDS,
      });
    }
    return emissions;
  },
};
