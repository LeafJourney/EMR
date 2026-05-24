// ===========================================================================
// EMR-790 — practiceManagerAgent (meta-orchestrator)
// ===========================================================================
// Umbrella under which every Practice Manager sub-agent runs. v1 fans out
// to a single sub-agent (`supplyReorderAgent`); the value here is the
// SHAPE — adding credentialExpiry / vendorContract / equipmentMaintenance
// later should be a one-line change to `SUB_AGENT_REGISTRY`.
//
// Discipline: NO business logic in this file. Decision-making belongs in the
// sub-agents. This layer is pure plumbing: fan-out, fan-in, error isolation,
// run summary, fleet log.
// ===========================================================================

import { z } from "zod";
import type { Agent, AgentContext } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { supplyReorderAgent } from "./supply-reorder-agent";

const AGENT_ID = "practiceManagerAgent";
const VERSION = "1.0.0";

// ---------------------------------------------------------------------------
// Sub-agent registry
// ---------------------------------------------------------------------------
// Each sub-agent is keyed by its public name and exposes an `invoke` that
// takes the orchestrator's context + practice scope. Returning unknown is
// intentional — the orchestrator does not interpret payloads, it just
// forwards them on the run summary.

type SubAgentInvoker = (args: {
  organizationId: string;
  ctx: AgentContext;
}) => Promise<unknown>;

interface SubAgentEntry {
  name: string;
  invoke: SubAgentInvoker;
}

const SUB_AGENT_REGISTRY: Record<string, SubAgentEntry> = {
  supplyReorderAgent: {
    name: "supplyReorderAgent",
    invoke: ({ organizationId, ctx }) =>
      supplyReorderAgent.run({ organizationId }, ctx),
  },
  // Stubs for the fan-out contract — wired in follow-up issues
  // (EMR-787 lists credentialExpiry / vendorContract / equipmentMaintenance
  // as planned siblings). Until those exist we keep the registry small.
};

/** Default enabled set. Per-practice config overrides this in a later issue. */
const DEFAULT_ENABLED: readonly string[] = ["supplyReorderAgent"];

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const input = z.object({
  organizationId: z.string(),
  subAgents: z.array(z.string()).optional(),
});

const subAgentRunSchema = z.object({
  name: z.string(),
  output: z.unknown(),
  durationMs: z.number(),
  error: z.string().optional(),
});

const output = z.object({
  organizationId: z.string(),
  subAgentRuns: z.array(subAgentRunSchema),
  startedAt: z.string(),
  completedAt: z.string(),
});

export type PracticeManagerAgentOutput = z.infer<typeof output>;
export type SubAgentRun = z.infer<typeof subAgentRunSchema>;

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const practiceManagerAgent: Agent<
  z.infer<typeof input>,
  PracticeManagerAgentOutput
> = {
  name: AGENT_ID,
  version: VERSION,
  description:
    "Meta-orchestrator for practice-management chores. Fans out to enabled " +
    "sub-agents (v1: supplyReorderAgent), isolates errors, aggregates a run " +
    "summary, and writes a single fleet-log entry.",
  inputSchema: input,
  outputSchema: output,
  // We don't write anything ourselves; sub-agents declare their own caps.
  // `write.task` is here so error-isolation logs can drop a follow-up task
  // if a sub-agent throws.
  allowedActions: ["write.task"],
  requiresApproval: false,

  async run({ organizationId, subAgents }, ctx) {
    const requested = subAgents?.length ? subAgents : DEFAULT_ENABLED;
    const startedAt = new Date();

    const runs: SubAgentRun[] = [];
    for (const name of requested) {
      const entry = SUB_AGENT_REGISTRY[name];
      if (!entry) {
        runs.push({
          name,
          output: null,
          durationMs: 0,
          error: `Unknown sub-agent: ${name}`,
        });
        continue;
      }
      const t0 = Date.now();
      try {
        const out = await entry.invoke({ organizationId, ctx });
        runs.push({
          name,
          output: out,
          durationMs: Date.now() - t0,
        });
      } catch (e) {
        // Error isolation: one failure does not halt the rest of the fleet.
        const message = e instanceof Error ? e.message : String(e);
        ctx.log("error", "Sub-agent failed", { name, error: message });
        runs.push({
          name,
          output: null,
          durationMs: Date.now() - t0,
          error: message,
        });
      }
    }

    const completedAt = new Date();

    await writeAgentAudit(
      AGENT_ID,
      VERSION,
      organizationId,
      "practice-manager.run.completed",
      { type: "Organization", id: organizationId },
      {
        subAgents: requested,
        runs: runs.map((r) => ({
          name: r.name,
          durationMs: r.durationMs,
          ok: !r.error,
        })),
      },
    );

    ctx.log("info", "practiceManagerAgent fan-out complete", {
      organizationId,
      subAgentCount: runs.length,
      errorCount: runs.filter((r) => r.error).length,
    });

    return {
      organizationId,
      subAgentRuns: runs,
      startedAt: startedAt.toISOString(),
      completedAt: completedAt.toISOString(),
    };
  },
};

/** Exported for tests / dev tooling — do NOT mutate at runtime. */
export const PRACTICE_MANAGER_SUB_AGENTS = Object.keys(SUB_AGENT_REGISTRY);
