// EMR-940 / EMR-969 — Agent Fleet metrics aggregation (pure).
//
// The Mission Control dashboard needs two things the schema can already
// answer but that had no aggregation layer:
//   - EMR-940: status-count tiles for dashboard filtering (how many jobs are
//     pending / running / needs_approval / succeeded / failed / cancelled).
//   - EMR-969: a hover summary of *running agent counts and jobs handled* per
//     agent, so an operator can see at a glance which agents are busy.
//
// This module is the pure projection: feed it the relevant AgentJob rows and a
// reference `now` and it returns the tiles + per-agent summary. No I/O, no
// Date.now() — the DB reader (agent-fleet-metrics.ts) supplies both. Keeping it
// pure mirrors agent-settings-logic.ts / approval-defaults-logic.ts and makes
// the aggregation unit-testable without a database.

/** Every AgentJobStatus value, in display order. Mirrors the Prisma enum. */
export const AGENT_JOB_STATUSES = [
  "pending",
  "claimed",
  "running",
  "needs_approval",
  "succeeded",
  "failed",
  "cancelled",
] as const;

export type AgentJobStatusName = (typeof AGENT_JOB_STATUSES)[number];

/** Non-terminal statuses — a job in one of these is still in the fleet's queue. */
export const ACTIVE_JOB_STATUSES: ReadonlyArray<AgentJobStatusName> = [
  "pending",
  "claimed",
  "running",
  "needs_approval",
];

/** In-flight statuses — a worker is (or just was) executing this job. */
const IN_FLIGHT_STATUSES: ReadonlyArray<AgentJobStatusName> = [
  "claimed",
  "running",
];

/** Terminal statuses — the job reached a final state and counts as "handled". */
const TERMINAL_STATUSES: ReadonlyArray<AgentJobStatusName> = [
  "succeeded",
  "failed",
  "cancelled",
];

const DAY_MS = 86_400_000;

/** The minimal AgentJob shape the aggregation needs. */
export interface FleetJobRow {
  agentName: string;
  status: string;
  createdAt: Date;
  completedAt: Date | null;
}

export interface FleetAgentSummary {
  agentName: string;
  /** All jobs in the window for this agent. */
  total: number;
  /** Currently executing (claimed + running). */
  running: number;
  /** Waiting to be claimed. */
  pending: number;
  /** Waiting on human sign-off. */
  needsApproval: number;
  /** Terminal jobs that finished in the last 24h ("jobs handled"). */
  handled24h: number;
  /** Per-status breakdown (zero-filled across all statuses). */
  byStatus: Record<AgentJobStatusName, number>;
}

export interface FleetMetrics {
  generatedAt: string;
  totals: {
    /** Total jobs in the window. */
    total: number;
    /** EMR-940 tiles — zero-filled across every status. */
    byStatus: Record<AgentJobStatusName, number>;
    /** pending + claimed + running + needs_approval. */
    active: number;
    /** needs_approval count — drives the approval-queue tile. */
    needsApproval: number;
    /** Terminal completions in the last 24h. */
    handled24h: number;
    /** Terminal completions in the last 7d. */
    handled7d: number;
  };
  /** Per-agent summary (EMR-969 hover), busiest first. */
  agents: FleetAgentSummary[];
}

function zeroStatusMap(): Record<AgentJobStatusName, number> {
  return Object.fromEntries(
    AGENT_JOB_STATUSES.map((s) => [s, 0]),
  ) as Record<AgentJobStatusName, number>;
}

function isStatus(value: string): value is AgentJobStatusName {
  return (AGENT_JOB_STATUSES as ReadonlyArray<string>).includes(value);
}

function handledWithin(row: FleetJobRow, now: Date, windowMs: number): boolean {
  if (!isStatus(row.status) || !TERMINAL_STATUSES.includes(row.status)) {
    return false;
  }
  if (!row.completedAt) return false;
  return now.getTime() - row.completedAt.getTime() <= windowMs;
}

/**
 * Project a set of AgentJob rows into dashboard tiles + per-agent summaries.
 *
 * Pure: callers pass the rows (already org-scoped + windowed) and the reference
 * `now`. Unknown status strings are tallied into `total` but skipped from the
 * status map so a future enum value never silently corrupts a tile.
 */
export function summarizeFleetMetrics(
  rows: FleetJobRow[],
  now: Date,
): FleetMetrics {
  const totalsByStatus = zeroStatusMap();
  const perAgent = new Map<string, FleetAgentSummary>();

  let handled24h = 0;
  let handled7d = 0;

  for (const row of rows) {
    if (isStatus(row.status)) {
      totalsByStatus[row.status] += 1;
    }

    const in24h = handledWithin(row, now, DAY_MS);
    const in7d = handledWithin(row, now, 7 * DAY_MS);
    if (in24h) handled24h += 1;
    if (in7d) handled7d += 1;

    let agent = perAgent.get(row.agentName);
    if (!agent) {
      agent = {
        agentName: row.agentName,
        total: 0,
        running: 0,
        pending: 0,
        needsApproval: 0,
        handled24h: 0,
        byStatus: zeroStatusMap(),
      };
      perAgent.set(row.agentName, agent);
    }
    agent.total += 1;
    if (isStatus(row.status)) {
      agent.byStatus[row.status] += 1;
      if (IN_FLIGHT_STATUSES.includes(row.status)) agent.running += 1;
      if (row.status === "pending") agent.pending += 1;
      if (row.status === "needs_approval") agent.needsApproval += 1;
    }
    if (in24h) agent.handled24h += 1;
  }

  const active = ACTIVE_JOB_STATUSES.reduce(
    (sum, s) => sum + totalsByStatus[s],
    0,
  );

  // Busiest first: running desc, then total desc, then name for a stable order.
  const agents = [...perAgent.values()].sort(
    (a, b) =>
      b.running - a.running ||
      b.total - a.total ||
      a.agentName.localeCompare(b.agentName),
  );

  return {
    generatedAt: now.toISOString(),
    totals: {
      total: rows.length,
      byStatus: totalsByStatus,
      active,
      needsApproval: totalsByStatus.needs_approval,
      handled24h,
      handled7d,
    },
    agents,
  };
}
