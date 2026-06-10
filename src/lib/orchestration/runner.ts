import type { AgentJob } from "@prisma/client";
import { createAgentContext } from "./context";
import { agentRegistry } from "@/lib/agents";
import type { Agent, ApprovalPolicy } from "./types";
import { StepExecutionGraph } from "./step-graph";
import {
  applyDefaultDecision,
  claimNextJob,
  markCancelled,
  markFailed,
  markNeedsApproval,
  markRunning,
  markSucceeded,
} from "./queue";
import type { ResolvedDecision } from "@/lib/db/approval-defaults-logic";

// ---------------------------------------------------------------------------
// Agent Harness V3 Runner
// ---------------------------------------------------------------------------
// Backward-compatible. V1 agents (run-only) work unchanged. V3 agents
// with plan() + runStep() get multi-step execution with reasoning traces.
// ---------------------------------------------------------------------------

/**
 * Normalize requiresApproval (boolean | ApprovalPolicy) to ApprovalPolicy.
 */
function normalizeApproval(raw: boolean | ApprovalPolicy): ApprovalPolicy {
  if (typeof raw === "boolean") {
    return { mode: raw ? "always" : "never" };
  }
  return raw;
}

/**
 * Determine whether a job needs approval based on the agent's policy
 * and the output confidence.
 */
function needsApproval(
  policy: ApprovalPolicy,
  jobOverride: boolean,
  outputConfidence?: number,
): boolean {
  if (jobOverride) return true;
  if (policy.mode === "always") return true;
  if (policy.mode === "never") return false;
  // threshold mode
  if (policy.mode === "threshold" && policy.confidenceThreshold != null) {
    const confidence = outputConfidence ?? 0;
    return confidence < policy.confidenceThreshold;
  }
  return false;
}

/**
 * Execute a single claimed job end-to-end: resolve the agent, build a
 * context, run it (single-shot or multi-step), and write the result + logs back.
 */
export async function runJob(job: AgentJob, workerId: string): Promise<void> {
  const agent = (agentRegistry as Record<string, Agent<any, any>>)[job.agentName];
  if (!agent) {
    await markFailed(job.id, `Unknown agent: ${job.agentName}`, [], false);
    return;
  }

  // EMR-974 — honor the Agent Fleet on/off switch before doing any work.
  // Disabling an agent is an operator choice, not an error, so a disabled
  // agent's claimed job is cancelled (terminal, no retry) and never executed.
  // Fail-open: an org with no setting row keeps the agent running. Dynamic
  // import keeps the server-only accessor out of any client bundle that pulls
  // the orchestration barrel.
  const { isAgentEnabled } = await import("@/lib/db/agent-settings");
  if (!(await isAgentEnabled(job.organizationId, job.agentName))) {
    await markCancelled(
      job.id,
      `Skipped: agent "${job.agentName}" is disabled for this organization`,
    );
    return;
  }

  await markRunning(job.id);

  const { ctx, drainLogs, reasoning } = createAgentContext({
    jobId: job.id,
    organizationId: job.organizationId,
    allowed: agent.allowedActions,
    agentName: agent.name,
    agentVersion: agent.version,
  });

  try {
    const input = agent.inputSchema.parse(job.input);
    ctx.log("info", `Running ${agent.name}@${agent.version}`, { workerId });

    let output: any;
    let overallConfidence: number | undefined;

    // ── V3 multi-step path ──────────────────────────
    if (agent.plan && agent.runStep) {
      ctx.log("info", "V3 multi-step execution");
      ctx.tools.step("plan-start");

      // Phase 1: Plan
      const plan = await agent.plan(input, ctx);
      ctx.log("info", `Plan created: ${plan.steps.length} steps`, {
        reasoning: plan.reasoning,
        steps: plan.steps.map((s) => s.name),
      });
      ctx.tools.step("plan-complete", { stepCount: plan.steps.length });

      // Phase 2: Execute steps in dependency order
      const stepGraph = new StepExecutionGraph(plan.steps);
      let maxIterations = Math.max(20, plan.steps.length * 4); // safety cap for dynamic expansion

      while (stepGraph.completedCount < stepGraph.totalSteps && maxIterations-- > 0) {
        const ready = stepGraph.takeReadyBatch();

        if (ready.length === 0) {
          const blocked = stepGraph.findBlockedStepIds();
          throw new Error(`Step deadlock: no runnable steps; blocked=${blocked.join(",")}`);
        }

        // Execute ready steps (could be parallelized in future)
        for (const step of ready) {
          ctx.tools.step(`step-${step.id}`, { name: step.name });
          ctx.log("info", `Executing step: ${step.name}`);

          const stepResult = await agent.runStep(step, input, ctx);
          ctx.stepResults.set(step.id, stepResult);
          stepGraph.markCompleted(step.id);

          ctx.tools.step(`step-${step.id}-complete`, {
            confidence: stepResult.confidence,
          });

          // Dynamic step addition
          if (stepResult.nextSteps?.length) {
            ctx.log("info", `Step ${step.name} added ${stepResult.nextSteps.length} new steps`);
            stepGraph.addSteps(stepResult.nextSteps);
            maxIterations += stepResult.nextSteps.length * 2;
          }
        }
      }

      if (maxIterations <= 0 && stepGraph.completedCount < stepGraph.totalSteps) {
        throw new Error(
          `Step iteration limit exceeded: completed=${stepGraph.completedCount} total=${stepGraph.totalSteps}`,
        );
      }

      // Phase 3: Final assembly — call run() with all step results available
      output = await agent.run(input, ctx);

      // Overall confidence = min of all step confidences
      const confidences = Array.from(ctx.stepResults.values()).map((r) => r.confidence);
      overallConfidence = confidences.length > 0
        ? Math.min(...confidences)
        : undefined;

    } else {
      // ── V1 single-shot path ──────────────────────────
      output = await agent.run(input, ctx);
    }

    agent.outputSchema.parse(output);
    ctx.log("info", "Run succeeded", { confidence: overallConfidence });

    // ── Approval routing ──────────────────────────────
    const policy = normalizeApproval(agent.requiresApproval);
    const mustApprove = needsApproval(policy, job.requiresApproval, overallConfidence);

    // EMR-960 — when a job would queue for human sign-off, first honor any
    // owner-configured default approve/reject decision for this org's agent or
    // workflow. A match auto-applies the decision (with a per-job audit entry);
    // no match falls through to the normal Needs-Approval queue. Resolution
    // failures are swallowed so the job still queues safely.
    let resolved: ResolvedDecision | null = null;
    if (mustApprove && job.organizationId) {
      try {
        const { resolveDefaultDecisionForOrg } = await import("@/lib/db/approval-defaults");
        resolved = await resolveDefaultDecisionForOrg(job.organizationId, {
          agentName: job.agentName,
          workflowName: job.workflowName,
        });
        if (resolved) {
          ctx.log(
            "info",
            `Auto-${resolved.decision} via default rule (${resolved.rule.scopeType}:${resolved.rule.scopeKey})`,
          );
        }
      } catch (e) {
        ctx.log(
          "warn",
          `approval-default resolution failed: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }

    // A no-op skip — the agent decided there was nothing to do (e.g. the
    // patient-outreach M6 dedup, which stands down when the physician-reviewed
    // visit-completion release already drafted the post-visit message) — is not
    // an artifact awaiting human sign-off. Routing it to needs_approval leaves a
    // phantom zero-action item in the physician's approvals surfaces (the clinic
    // dashboard needs_approval count + fleet activity feed). Resolve it as a
    // benign success so the inbox only shows actionable drafts.
    const isNoOpSkip =
      output != null &&
      typeof output === "object" &&
      (output as { skipped?: unknown }).skipped === true;

    const finalLogs = drainLogs();
    if (!mustApprove || isNoOpSkip) {
      await markSucceeded(job.id, output, finalLogs);
    } else if (resolved) {
      await applyDefaultDecision(
        {
          id: job.id,
          organizationId: job.organizationId,
          agentName: job.agentName,
          workflowName: job.workflowName,
        },
        resolved,
        output,
        finalLogs,
      );
    } else {
      await markNeedsApproval(job.id, output, finalLogs);
    }

    // ── Persist reasoning trace (best-effort) ─────────
    if (reasoning.steps.length > 0) {
      try {
        const { startReasoning } = await import("@/lib/agents/memory/agent-reasoning");
        // We just record the raw trace — the reasoning module handles persistence
        ctx.log("info", `Reasoning trace: ${reasoning.steps.length} steps, ${Object.keys(reasoning.sources).length} source kinds`);
      } catch {
        // Reasoning persistence is best-effort
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.log("error", message);
    const retry = !isDeterministic(err);
    await markFailed(job.id, message, drainLogs(), retry);
  }
}

function isDeterministic(err: unknown): boolean {
  if (err instanceof Error) {
    return /ZodError|validation|UNAUTHORIZED|FORBIDDEN|not permitted|Unknown agent/i.test(err.message);
  }
  return false;
}

/**
 * Poll-and-run loop. Used by the standalone worker and by the in-process
 * dev runner. Returns the number of jobs executed in this tick.
 */
export async function runTick(workerId: string, batchSize = 5): Promise<number> {
  let ran = 0;
  for (let i = 0; i < batchSize; i++) {
    const job = await claimNextJob(workerId);
    if (!job) break;
    await runJob(job, workerId);
    ran++;
  }
  return ran;
}
