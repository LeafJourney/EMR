// EMR-754 — AI model brokering proxy layer.
//
// Every agent call routes through `invoke()` so that:
//   1. Per-practice / per-agent model selection is centralized
//      (PracticeAiConfig: per-agent override → org default → registry fallback).
//   2. Cost guardrails ([[EMR-756]]) can short-circuit the call when the
//      practice is throttled — returning a structured 429-shaped error.
//   3. Every upstream call writes an `LlmUsage` row (success and failure
//      both) so token accounting + anomaly detection have a stable feed.
//
// This module is the *contract* — the model client (OpenRouter, Anthropic,
// etc.) is selected by the registry and not visible to callers.
//
// Status: v1 ships the contract + a passthrough implementation that uses
// the existing OpenRouter client. PracticeAiConfig + LlmUsage Prisma
// models land separately (EMR-751 + a follow-up). Until they exist the
// broker logs to console and stores no usage row; the call site interface
// is stable so wiring those in is a one-file change.

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The set of agent "buckets" we account against. Buckets are coarser than
 * individual agents — they group agents that share a billing intent so
 * the broker can apply per-bucket cost caps without enumerating every
 * agent name.
 */
export const AGENT_BUCKETS = [
  "charting",
  "billing",
  "messaging",
  "research",
  "background",
  "patient_facing",
  "uncategorized",
] as const;
export type AgentBucket = (typeof AGENT_BUCKETS)[number];

export type BrokerMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export interface BrokerInvokeArgs {
  /** Tenant scope. Required — every call is billed to an organization. */
  practiceId: string;
  /** Which billing/cost bucket this call belongs to. */
  agentBucket: AgentBucket;
  /** Stable agent identifier for telemetry (e.g. "charting.note-summarize"). */
  agentName: string;
  /**
   * Caller-suggested model. The broker may override based on
   * PracticeAiConfig. Use `null` to defer entirely to the registry.
   */
  model: string | null;
  messages: BrokerMessage[];
  /** Optional response format — passed through verbatim to the upstream. */
  responseFormat?: "json_object" | "text";
  /** Soft cap. The broker rejects above this with `code: "max_tokens_too_high"`. */
  maxOutputTokens?: number;
}

export type BrokerResult =
  | {
      ok: true;
      model: string;
      content: string;
      tokensIn: number;
      tokensOut: number;
      latencyMs: number;
    }
  | {
      ok: false;
      code: "throttled" | "upstream_error" | "no_api_key" | "max_tokens_too_high";
      message: string;
      retryAfterSeconds?: number;
    };

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const DEFAULT_MODEL = "deepseek/deepseek-chat";
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

/**
 * Resolve the effective model for a call.
 *
 * Order of precedence (when PracticeAiConfig is wired in EMR-754 follow-up):
 *   1. caller-supplied `args.model` (if not null and not overridden)
 *   2. PracticeAiConfig per-agent override for `agentBucket`
 *   3. PracticeAiConfig org default
 *   4. DEFAULT_MODEL (registry fallback)
 *
 * Today (no PracticeAiConfig yet) we honor (1) and fall back to (4).
 */
async function resolveModel(args: BrokerInvokeArgs): Promise<string> {
  if (args.model) return args.model;
  // TODO(EMR-754 follow-up): read PracticeAiConfig once it exists.
  return DEFAULT_MODEL;
}

/**
 * Check whether the practice's AI usage is currently throttled. Returns
 * `null` when allowed, or the structured throttle response when blocked.
 *
 * Reads PracticeSubscription.throttled, which is reconciled by
 * cost-guardrails.reconcileThrottleState() on a cron + can be flipped
 * manually via the override action.
 */
async function checkThrottle(
  practiceId: string,
): Promise<Extract<BrokerResult, { ok: false }> | null> {
  const delegate = (prisma as unknown as Record<string, unknown>)[
    "practiceSubscription"
  ] as
    | undefined
    | {
        findUnique: (args: {
          where: { organizationId: string };
          select: { throttled: true };
        }) => Promise<{ throttled: boolean } | null>;
      };
  if (!delegate) return null;

  const sub = await delegate
    .findUnique({
      where: { organizationId: practiceId },
      select: { throttled: true },
    })
    .catch(() => null);

  if (!sub || !sub.throttled) return null;
  return {
    ok: false,
    code: "throttled",
    message:
      "AI usage is currently throttled for this practice — token cap exceeded.",
    retryAfterSeconds: 300,
  };
}

/**
 * Append-only usage row writer. No-op until LlmUsage Prisma model lands.
 * Exported for testing — call sites should never invoke directly.
 */
export async function recordLlmUsage(row: {
  practiceId: string;
  agentBucket: AgentBucket;
  agentName: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
}): Promise<void> {
  // Structured log so an aggregator can already see the shape we'll
  // eventually persist; the row gets durable storage once LlmUsage lands.
  logger.info({ event: "llm.usage", ...row });
}

/**
 * The one entry point. All agent code calls this — no direct fetch to
 * the model provider.
 */
export async function invoke(args: BrokerInvokeArgs): Promise<BrokerResult> {
  if (
    args.maxOutputTokens != null &&
    args.maxOutputTokens > DEFAULT_MAX_OUTPUT_TOKENS
  ) {
    return {
      ok: false,
      code: "max_tokens_too_high",
      message: `requested max_output_tokens=${args.maxOutputTokens} exceeds broker cap ${DEFAULT_MAX_OUTPUT_TOKENS}`,
    };
  }

  const throttle = await checkThrottle(args.practiceId);
  if (throttle) {
    await recordLlmUsage({
      practiceId: args.practiceId,
      agentBucket: args.agentBucket,
      agentName: args.agentName,
      model: args.model ?? "unknown",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      ok: false,
      errorCode: throttle.code,
    });
    return throttle;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false,
      code: "no_api_key",
      message: "OPENROUTER_API_KEY is not set in this environment",
    };
  }

  const model = await resolveModel(args);
  const t0 = Date.now();

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: args.messages,
        ...(args.responseFormat === "json_object"
          ? { response_format: { type: "json_object" } }
          : {}),
        ...(args.maxOutputTokens != null
          ? { max_tokens: args.maxOutputTokens }
          : {}),
      }),
    });

    const latencyMs = Date.now() - t0;

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await recordLlmUsage({
        practiceId: args.practiceId,
        agentBucket: args.agentBucket,
        agentName: args.agentName,
        model,
        tokensIn: 0,
        tokensOut: 0,
        latencyMs,
        ok: false,
        errorCode: `upstream_${res.status}`,
      });
      return {
        ok: false,
        code: "upstream_error",
        message: `upstream ${res.status}: ${text.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = json.choices?.[0]?.message?.content ?? "";
    const tokensIn = json.usage?.prompt_tokens ?? 0;
    const tokensOut = json.usage?.completion_tokens ?? 0;

    await recordLlmUsage({
      practiceId: args.practiceId,
      agentBucket: args.agentBucket,
      agentName: args.agentName,
      model,
      tokensIn,
      tokensOut,
      latencyMs,
      ok: true,
    });

    return { ok: true, model, content, tokensIn, tokensOut, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    await recordLlmUsage({
      practiceId: args.practiceId,
      agentBucket: args.agentBucket,
      agentName: args.agentName,
      model,
      tokensIn: 0,
      tokensOut: 0,
      latencyMs,
      ok: false,
      errorCode: "network",
    });
    return {
      ok: false,
      code: "upstream_error",
      message,
    };
  }
}
