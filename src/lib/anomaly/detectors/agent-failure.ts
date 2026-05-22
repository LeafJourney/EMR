// EMR-737 — Agent failure detector.
//
// Counts `ControllerAuditLog` rows over the last hour whose `action` ends
// in `.error` (e.g. "controller.template.create.error"), grouped by
// `organizationId`. Threshold: more than 5 errors per organization within
// the trailing 1h window. See `src/lib/practice-health/scorer.ts` for the
// established pattern this detector mirrors.
//
// Severity: CRITICAL — agent errors are operator-actionable now, not in
// hours.
//
// Idempotency key: `agent_failure:${orgId}:${YYYY-MM-DDTHH}` (UTC). The
// hour bucket coalesces re-detection on the same window.
//
// PHI: none. `context` carries org id, error count, and the bucket — no
// audit payload, no actor identity.

import type { PrismaClient } from "@prisma/client";

import type { AnomalyDetector, AnomalyEmission } from "../framework";

const ERROR_THRESHOLD = 5;
const TTL_SECONDS = 60 * 60; // 1 hour

/** UTC YYYY-MM-DDTHH bucket. */
function hourBucket(d: Date): string {
  return `${d.toISOString().slice(0, 13)}`;
}

export const agentFailureDetector: AnomalyDetector = {
  slug: "agent_failure",
  async run(prisma: PrismaClient): Promise<AnomalyEmission[]> {
    const now = new Date();
    const since = new Date(now.getTime() - 60 * 60 * 1000);

    const groups = await prisma.controllerAuditLog.groupBy({
      by: ["organizationId"],
      where: {
        at: { gte: since },
        action: { endsWith: ".error" },
        organizationId: { not: null },
      },
      _count: { _all: true },
    });

    const bucket = hourBucket(now);
    const emissions: AnomalyEmission[] = [];
    for (const g of groups) {
      const orgId = g.organizationId;
      if (!orgId) continue;
      const count = g._count._all;
      if (count <= ERROR_THRESHOLD) continue;

      const idempotencyKey = `agent_failure:${orgId}:${bucket}`;
      emissions.push({
        slug: `agent-failure-${orgId}-${bucket}`,
        idempotencyKey,
        severity: "critical",
        practiceId: orgId,
        message: `Practice ${orgId} hit ${count} agent errors in the last hour`,
        deeplinkUrl: `/admin/audit?practice=${orgId}&action=error`,
        context: {
          organizationId: orgId,
          errorCount: count,
          windowHours: 1,
          hourBucket: bucket,
        },
        ttlSeconds: TTL_SECONDS,
      });
    }
    return emissions;
  },
};
