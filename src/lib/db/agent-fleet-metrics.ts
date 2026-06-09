// EMR-940 / EMR-969 — Agent Fleet metrics reader (server-side).
//
// Fetches the AgentJob rows relevant to the Mission Control dashboard for one
// org and hands them to the pure summarizer. The query is bounded so a busy
// org never reads its entire (unbounded) job history: every non-terminal job
// (so active/queue counts are always exact) plus terminal jobs that finished
// or were created in the last 7 days (so "jobs handled" windows are accurate).

import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  ACTIVE_JOB_STATUSES,
  type FleetJobRow,
  type FleetMetrics,
  summarizeFleetMetrics,
} from "./agent-fleet-metrics-logic";

const DAY_MS = 86_400_000;

/** Hard cap on rows read per request — protects against a runaway org. */
const ROW_CAP = 10_000;

/**
 * Compute live fleet metrics (status tiles + per-agent summary) for an org.
 *
 * `now` is injectable for deterministic tests; defaults to the call time.
 */
export async function getFleetMetrics(
  organizationId: string,
  now: Date = new Date(),
): Promise<FleetMetrics> {
  const sevenDaysAgo = new Date(now.getTime() - 7 * DAY_MS);

  const rows = await prisma.agentJob.findMany({
    where: {
      organizationId,
      OR: [
        // Every in-flight / queued job, regardless of age.
        { status: { in: [...ACTIVE_JOB_STATUSES] } },
        // Recently-finished jobs for the "handled" windows.
        { completedAt: { gte: sevenDaysAgo } },
        { createdAt: { gte: sevenDaysAgo } },
      ],
    },
    select: { agentName: true, status: true, createdAt: true, completedAt: true },
    orderBy: { createdAt: "desc" },
    take: ROW_CAP,
  });

  return summarizeFleetMetrics(rows as FleetJobRow[], now);
}
