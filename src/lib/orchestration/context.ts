import { prisma } from "@/lib/db/prisma";
import { dispatch } from "./dispatch";
import { resolveModelClient } from "./model-client";
import { withPhiRedaction } from "./redacting-model-client";
import { buildToolRegistry } from "./tool-registry";
import type { AgentContext, AgentLogEntry, AllowedAction, StepResult } from "./types";
import type { DomainEvent } from "./events";

interface CreateContextArgs {
  jobId: string;
  organizationId: string | null;
  allowed: AllowedAction[];
  agentName: string;
  agentVersion: string;
}

// ---------------------------------------------------------------------------
// V3: Reasoning trace accumulator
// ---------------------------------------------------------------------------

export interface ReasoningAccumulator {
  steps: Array<{
    step: string;
    at: string;
    durationMs?: number;
    input?: Record<string, unknown>;
    output?: Record<string, unknown>;
  }>;
  sources: Record<string, string[]>;
  alternatives: Array<{ label: string; reason: string }>;
}

/**
 * Build a scoped context for an agent run. The context is the ONLY way an
 * agent touches the outside world — logs, emits, capability checks, model
 * calls, tools, and reasoning traces.
 *
 * V3: Now includes a full tool registry + reasoning accumulator.
 */
export function createAgentContext(args: CreateContextArgs): {
  ctx: AgentContext;
  drainLogs(): AgentLogEntry[];
  reasoning: ReasoningAccumulator;
} {
  const logs: AgentLogEntry[] = [];
  const allowedSet = new Set(args.allowed);

  // Reasoning trace accumulator
  const reasoning: ReasoningAccumulator = {
    steps: [],
    sources: {},
    alternatives: [],
  };

  const stepFn = (name: string, data?: Record<string, unknown>) => {
    reasoning.steps.push({
      step: name,
      at: new Date().toISOString(),
      input: data,
    });
  };

  const sourceFn = (kind: string, ids: string[]) => {
    if (!reasoning.sources[kind]) reasoning.sources[kind] = [];
    reasoning.sources[kind].push(...ids);
  };

  // Build tool registry with permission scoping
  const tools = buildToolRegistry({
    agentName: args.agentName,
    agentVersion: args.agentVersion,
    organizationId: args.organizationId,
    allowed: allowedSet,
    stepFn,
    sourceFn,
  });

  const ctx: AgentContext = {
    jobId: args.jobId,
    organizationId: args.organizationId,
    log(level, message, data) {
      logs.push({ at: new Date().toISOString(), level, message, data });
    },
    async emit(event: DomainEvent) {
      await dispatch(event);
    },
    assertCan(action: AllowedAction) {
      if (!allowedSet.has(action)) {
        throw new Error(`Agent ${args.agentName}@${args.agentVersion} not permitted to ${action}`);
      }
    },
    model: withPhiRedaction(
      resolveModelClient(args.organizationId, args.agentName),
      args.agentName,
    ),
    tools,
    stepResults: new Map<string, StepResult>(),
  };

  return {
    ctx,
    drainLogs: () => logs,
    reasoning,
  };
}

/**
 * Write an audit log row with an agent actor.
 */
export async function writeAgentAudit(
  agentName: string,
  agentVersion: string,
  organizationId: string | null,
  action: string,
  subject: { type: string; id: string } | null,
  metadata?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: {
      organizationId: organizationId ?? undefined,
      actorAgent: `agent:${agentName}@${agentVersion}`,
      action,
      subjectType: subject?.type,
      subjectId: subject?.id,
      metadata: metadata as any,
    },
  });
}

/**
 * Build a lightweight V3-compatible context for server actions that call
 * agents directly (not through the job queue). Includes tools and stepResults
 * so the AgentContext type is satisfied, but doesn't persist reasoning traces.
 */
export function createLightContext(opts: {
  jobId?: string;
  organizationId?: string | null;
  agentName?: string;
}): AgentContext {
  const noop = () => {};
  const noopSource = () => {};
  const allowed = new Set<AllowedAction>([
    "read.patient", "read.encounter", "read.document", "read.note",
    "read.research", "read.claim", "read.payment", "read.statement",
    "write.chartSummary", "write.document.metadata", "write.note.draft",
    "write.message.draft", "write.task", "write.coding", "write.qualification",
    "write.outcome.reminder", "write.launchStatus", "write.claim.scrub",
    "write.claim.status", "write.financialEvent", "write.statement",
    "write.denial.triage", "write.payment.match",
  ] as AllowedAction[]);

  const tools = buildToolRegistry({
    agentName: opts.agentName ?? "server-action",
    agentVersion: "1.0.0",
    organizationId: opts.organizationId ?? null,
    allowed,
    stepFn: noop,
    sourceFn: noopSource,
  });

  return {
    jobId: opts.jobId ?? `action-${Date.now()}`,
    organizationId: opts.organizationId ?? null,
    log() {},
    async emit() {},
    assertCan() {},
    model: withPhiRedaction(
      resolveModelClient(opts.organizationId, opts.agentName),
      opts.agentName,
    ),
    tools,
    stepResults: new Map(),
  };
}
