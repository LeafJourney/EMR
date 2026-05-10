/**
 * Agent Reasoning traces.
 *
 * Every agent output should have an associated reasoning trace: the steps
 * it took, the data it consulted, the alternatives it considered, and a
 * confidence score. The trace is what powers the "click to see why this
 * draft exists" surface in the clinician UI.
 *
 * This is the single strongest pro-transparency tool in the harness. A
 * physician reviewing a draft should NEVER have to guess what the agent
 * was thinking. Click the explain icon → see the full chain.
 *
 * Usage pattern inside an agent:
 *
 *   const trace = startReasoning("correspondenceNurse", "1.0.0", ctx.jobId);
 *   trace.step("load patient chart", { patientId });
 *   const memories = await recallMemories(patientId);
 *   trace.step("recalled memories", { count: memories.length }, memories);
 *   trace.source("memories", memories.map(m => m.id));
 *   ...
 *   trace.conclude({
 *     confidence: 0.82,
 *     summary: "Referenced patient's preference for fewer pills and the
 *     working CBN regimen before drafting a gentle check-in."
 *   });
 *   await trace.persist();
 */

import { prisma } from "@/lib/db/prisma";
import type { AgentReasoning } from "@prisma/client";
import { logger } from "@/lib/observability/log";

export interface ReasoningStep {
  step: string;
  at: string;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
}

export interface ReasoningTrace {
  step(name: string, input?: Record<string, unknown>, output?: unknown): void;
  source(kind: string, ids: string[]): void;
  alternative(label: string, reason: string): void;
  conclude(opts: { confidence?: number; summary?: string }): void;
  persist(): Promise<AgentReasoning | null>;
  toJSON(): {
    steps: ReasoningStep[];
    sources: Record<string, string[]>;
    alternatives: Array<{ label: string; reason: string }>;
    confidence: number | null;
    summary: string | null;
  };
}

export function startReasoning(
  agentName: string,
  agentVersion: string,
  agentJobId: string | null,
): ReasoningTrace {
  const steps: ReasoningStep[] = [];
  const sources: Record<string, string[]> = {};
  const alternatives: Array<{ label: string; reason: string }> = [];
  let confidence: number | null = null;
  let summary: string | null = null;
  let lastStepStart = Date.now();

  return {
    step(name, input, output) {
      const now = Date.now();
      const durationMs = now - lastStepStart;
      lastStepStart = now;
      steps.push({
        step: name,
        at: new Date().toISOString(),
        durationMs,
        input: input ?? undefined,
        output:
          output !== undefined
            ? ({ value: compact(output) } as Record<string, unknown>)
            : undefined,
      });
    },
    source(kind, ids) {
      sources[kind] = [...(sources[kind] ?? []), ...ids];
    },
    alternative(label, reason) {
      alternatives.push({ label, reason });
    },
    conclude(opts) {
      if (typeof opts.confidence === "number") {
        confidence = Math.min(1, Math.max(0, opts.confidence));
      }
      if (opts.summary) summary = opts.summary;
    },
    async persist() {
      try {
        return await prisma.agentReasoning.create({
          data: {
            agentJobId,
            agentName,
            agentVersion,
            steps: steps as any,
            sources: sources as any,
            alternatives: alternatives.length > 0 ? (alternatives as any) : null,
            confidence,
            summary,
          },
        });
      } catch (err) {
        // Reasoning persistence is best-effort. A failure here should
        // NEVER take down the agent run. The trace is a nice-to-have
        // for transparency; the actual output has already been produced.
        logger.warn({
          event: "agent.reasoning.persist_failed",
          agentName,
          err,
        });
        return null;
      }
    },
    toJSON() {
      return {
        steps,
        sources,
        alternatives,
        confidence,
        summary,
      };
    },
  };
}

/**
 * Compact arbitrary values for storage in the steps log. We don't want
 * to pickle entire patient records into reasoning rows.
 */
function compact(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 500 ? value.slice(0, 500) + "…" : value;
  }
  if (Array.isArray(value)) {
    return {
      count: value.length,
      sample: value.slice(0, 3).map(compact),
    };
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length > 12) {
      return { keys: keys.length, sample: keys.slice(0, 6) };
    }
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = compact(obj[k]);
    return out;
  }
  return value;
}

/**
 * Recall the most recent reasoning traces for an agent. Used by the
 * physician-facing "explain why" UI.
 */
export async function recallReasoning(
  agentJobId: string,
): Promise<AgentReasoning | null> {
  return prisma.agentReasoning.findFirst({
    where: { agentJobId },
    orderBy: { createdAt: "desc" },
  });
}
