// EMR-740 — Webhook delivery health detector.
//
// Watches fleet-wide webhook health by counting `ControllerAuditLog` rows
// whose `action` matches `webhook.*` over the last hour. Outcome split is
// inferred from the `.ok` vs `.error` suffix that controller audit emitters
// use across the codebase.
//
//   - success rate < 95% over 1h → WARNING
//   - success rate < 80% over 1h → CRITICAL
//
// Per-organization rollups would be cleaner, but most inbound webhooks
// (Clerk, Payabli, Payabli marketplace, ProHub, etc.) are not yet tagged
// with an organizationId on every emission — they fire before tenant
// resolution. So this v1 detector emits ONE fleet-wide anomaly per hour
// when the rate dips below the threshold. The drill-deeplink filters the
// audit-log viewer for the same window so an operator can see which
// upstream is faulty.
//
// TODO(webhook-health-per-tenant): once webhook handlers tag rows with
// organizationId at receipt time, switch to a groupBy over orgs and emit
// per-practice anomalies. The fleet-wide row will still fire when
// no-tenant deliveries dominate (e.g. svix sig verification failures).
//
// PHI: none. `context` carries counts and the hour bucket.

import type { PrismaClient } from "@prisma/client";

import type { AnomalyDetector, AnomalyEmission } from "../framework";

const WARNING_THRESHOLD = 0.95;
const CRITICAL_THRESHOLD = 0.8;
const TTL_SECONDS = 60 * 60; // 1 hour

function hourBucket(d: Date): string {
  return `${d.toISOString().slice(0, 13)}`;
}

export const webhookHealthDetector: AnomalyDetector = {
  slug: "webhook_health",
  async run(prisma: PrismaClient): Promise<AnomalyEmission[]> {
    const now = new Date();
    const since = new Date(now.getTime() - 60 * 60 * 1000);

    const [okRows, errorRows] = await Promise.all([
      prisma.controllerAuditLog.count({
        where: {
          at: { gte: since },
          AND: [
            { action: { startsWith: "webhook." } },
            { NOT: { action: { endsWith: ".error" } } },
          ],
        },
      }),
      prisma.controllerAuditLog.count({
        where: {
          at: { gte: since },
          AND: [
            { action: { startsWith: "webhook." } },
            { action: { endsWith: ".error" } },
          ],
        },
      }),
    ]);

    const total = okRows + errorRows;
    if (total === 0) return [];

    const successRate = okRows / total;
    if (successRate >= WARNING_THRESHOLD) return [];

    const severity = successRate < CRITICAL_THRESHOLD ? "critical" : "warning";
    const bucket = hourBucket(now);
    const idempotencyKey = `webhook_health:${bucket}`;
    return [
      {
        slug: `webhook-health-${bucket}`,
        idempotencyKey,
        severity,
        practiceId: null,
        message: `Webhook success rate dropped to ${(successRate * 100).toFixed(1)}% over the last hour (${errorRows} of ${total} failed)`,
        deeplinkUrl: `/admin/audit?action=webhook&from=${since.toISOString()}`,
        context: {
          windowHours: 1,
          hourBucket: bucket,
          okCount: okRows,
          errorCount: errorRows,
          successRate,
        },
        ttlSeconds: TTL_SECONDS,
      },
    ];
  },
};
