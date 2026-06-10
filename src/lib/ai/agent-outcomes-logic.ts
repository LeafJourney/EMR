// Phase 0 telemetry — agent outcome roll-up (pure).
//
// Projects a window of AgentOutcome rows into the acceptance-rate and
// minutes-saved figures the Agent Value surface renders. Pure (no I/O) so the
// math is unit-testable without a database; the DB reader (agent-outcomes.ts)
// supplies the rows.

export type AgentOutcomeDecision =
  | "accepted"
  | "accepted_with_edits"
  | "rejected"
  | "dismissed"
  | "auto_applied";

export interface OutcomeRow {
  agentName: string;
  decision: AgentOutcomeDecision;
  estimatedMinutesSaved: number | null;
}

export interface OutcomeStats {
  /** Total decisions in the window. */
  decisions: number;
  /** accepted + accepted_with_edits. */
  accepted: number;
  rejected: number;
  dismissed: number;
  autoApplied: number;
  /**
   * Accepted as a share of human accept/reject judgments
   * (accepted / (accepted + rejected)). Null when no human reviewed anything,
   * so the UI can show "—" instead of a misleading 0%.
   */
  acceptanceRate: number | null;
  /** Sum of estimatedMinutesSaved across the window. */
  minutesSaved: number;
}

export interface AgentOutcomeGroup extends OutcomeStats {
  agentName: string;
}

export interface AgentOutcomeSummary {
  totals: OutcomeStats;
  byAgent: AgentOutcomeGroup[];
}

/** Decisions that mean the output was used (and so carry time saved). */
const ACCEPTED: ReadonlySet<AgentOutcomeDecision> = new Set([
  "accepted",
  "accepted_with_edits",
]);

function emptyStats(): OutcomeStats {
  return {
    decisions: 0,
    accepted: 0,
    rejected: 0,
    dismissed: 0,
    autoApplied: 0,
    acceptanceRate: null,
    minutesSaved: 0,
  };
}

function tally(stats: OutcomeStats, row: OutcomeRow): void {
  stats.decisions += 1;
  if (ACCEPTED.has(row.decision)) stats.accepted += 1;
  else if (row.decision === "rejected") stats.rejected += 1;
  else if (row.decision === "dismissed") stats.dismissed += 1;
  else if (row.decision === "auto_applied") stats.autoApplied += 1;
  stats.minutesSaved += row.estimatedMinutesSaved ?? 0;
}

/** Finalize the derived acceptanceRate once all rows are tallied. */
function seal(stats: OutcomeStats): OutcomeStats {
  const reviewed = stats.accepted + stats.rejected;
  stats.acceptanceRate = reviewed > 0 ? stats.accepted / reviewed : null;
  return stats;
}

const byMinutesSavedDesc = (a: AgentOutcomeGroup, b: AgentOutcomeGroup) =>
  b.minutesSaved - a.minutesSaved || a.agentName.localeCompare(b.agentName);

/** Roll a window of outcome rows into totals + per-agent groups. */
export function summarizeAgentOutcomes(rows: OutcomeRow[]): AgentOutcomeSummary {
  const totals = emptyStats();
  const agents = new Map<string, OutcomeStats>();

  for (const row of rows) {
    tally(totals, row);
    let g = agents.get(row.agentName);
    if (!g) {
      g = emptyStats();
      agents.set(row.agentName, g);
    }
    tally(g, row);
  }

  const byAgent: AgentOutcomeGroup[] = [...agents.entries()]
    .map(([agentName, stats]) => ({ agentName, ...seal(stats) }))
    .sort(byMinutesSavedDesc);

  return { totals: seal(totals), byAgent };
}
