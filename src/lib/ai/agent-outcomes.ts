// Phase 0 telemetry — agent acceptance / time-saved ledger (DB access).
//
// Writes one AgentOutcome row per human (or auto) decision and reads windows
// back for the Agent Value surface. The pure roll-up lives in
// agent-outcomes-logic.ts; this module is the thin DB seam.
//
// Capture is best-effort: a telemetry write must never throw into a clinical
// or billing flow, so failures are logged and swallowed (the same contract as
// persistLlmUsage).

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import {
  type AgentOutcomeDecision,
  type AgentOutcomeSummary,
  type OutcomeRow,
  summarizeAgentOutcomes,
} from "./agent-outcomes-logic";

const DAY_MS = 86_400_000;
const ROW_CAP = 10_000;

/**
 * Baseline minutes of human work saved when an agent's output is *used*,
 * keyed by the artifact type. These are deliberately conservative starting
 * estimates — once the ledger has volume we can replace them with measured
 * medians. Callers may always pass an explicit override.
 */
export const OUTCOME_MINUTES_SAVED_BASELINE: Record<string, number> = {
  note: 8, // a drafted SOAP note the clinician would otherwise type
  coding: 4, // CPT/ICD selection + modifier reasoning
  claim: 5, // claim assembly + scrub triage
  message_draft: 3, // a patient/portal reply drafted for sign-off
  task: 2, // a triaged + routed follow-up
  summary: 3, // a chart / visit summary
};

const DEFAULT_MINUTES_SAVED = 2;

/** Decisions that mean the output was used (and so banked time). */
const USED: ReadonlySet<AgentOutcomeDecision> = new Set([
  "accepted",
  "accepted_with_edits",
  "auto_applied",
]);

/**
 * Estimated minutes saved for a decision. An explicit override wins; otherwise
 * a "used" decision banks the per-subject baseline and a reject/dismiss banks
 * nothing (rejected work saved no time).
 */
export function estimatedMinutesSavedFor(
  subjectType: string,
  decision: AgentOutcomeDecision,
  override?: number | null,
): number | null {
  if (override !== undefined && override !== null) return override;
  if (!USED.has(decision)) return 0;
  return OUTCOME_MINUTES_SAVED_BASELINE[subjectType] ?? DEFAULT_MINUTES_SAVED;
}

export interface RecordOutcomeInput {
  organizationId: string;
  agentName: string;
  subjectType: string;
  decision: AgentOutcomeDecision;
  agentJobId?: string | null;
  subjectId?: string | null;
  decidedById?: string | null;
  /** Override the baseline minutes-saved estimate for this decision. */
  estimatedMinutesSaved?: number | null;
  note?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Record one outcome decision. Best-effort and append-only — never throws into
 * the caller's flow. Returns the new row id, or null if the write was skipped
 * or failed.
 */
export async function recordAgentOutcome(
  input: RecordOutcomeInput,
): Promise<string | null> {
  const estimatedMinutesSaved = estimatedMinutesSavedFor(
    input.subjectType,
    input.decision,
    input.estimatedMinutesSaved,
  );

  logger.info({
    event: "agent.outcome",
    organizationId: input.organizationId,
    agentName: input.agentName,
    subjectType: input.subjectType,
    decision: input.decision,
    estimatedMinutesSaved,
  });

  try {
    const created = await prisma.agentOutcome.create({
      data: {
        organizationId: input.organizationId,
        agentName: input.agentName,
        subjectType: input.subjectType,
        decision: input.decision,
        agentJobId: input.agentJobId ?? null,
        subjectId: input.subjectId ?? null,
        decidedById: input.decidedById ?? null,
        estimatedMinutesSaved,
        note: input.note ?? null,
        metadata: (input.metadata ?? undefined) as never,
      },
      select: { id: true },
    });
    return created.id;
  } catch (err) {
    logger.warn({
      event: "agent.outcome.persist_failed",
      agentName: input.agentName,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Roll up an org's agent outcomes since `since` (default: trailing 30d) into
 * acceptance-rate + minutes-saved totals and per-agent groups.
 */
export async function getOrgOutcomeSummary(
  organizationId: string,
  since: Date = new Date(Date.now() - 30 * DAY_MS),
): Promise<AgentOutcomeSummary> {
  const rows = await prisma.agentOutcome.findMany({
    where: { organizationId, createdAt: { gte: since } },
    select: { agentName: true, decision: true, estimatedMinutesSaved: true },
    take: ROW_CAP,
  });
  return summarizeAgentOutcomes(rows as OutcomeRow[]);
}
