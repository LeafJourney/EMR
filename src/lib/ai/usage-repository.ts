import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-755 — LlmUsage ledger access.
//
// Reaches the `llmUsage` delegate through `unknown` (the same pattern
// cost-guardrails uses for PracticeSubscription) so this compiles against
// generated clients that predate the model. Once everyone is on the new
// schema this becomes `prisma.llmUsage`.

export interface LlmUsageRow {
  organizationId: string;
  agentBucket: string;
  agentName: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  ok: boolean;
  errorCode?: string | null;
}

interface LlmUsageDelegate {
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  aggregate: (args: {
    where: Record<string, unknown>;
    _sum: { tokensIn: true; tokensOut: true };
  }) => Promise<{ _sum: { tokensIn: number | null; tokensOut: number | null } }>;
}

function llmUsageDelegate(): LlmUsageDelegate | undefined {
  return (prisma as unknown as Record<string, unknown>)["llmUsage"] as
    | LlmUsageDelegate
    | undefined;
}

/**
 * Persist one usage row. Best-effort and append-only: it logs the structured
 * usage line (so an aggregator sees it even pre-migration) and never throws
 * into the model call path — a telemetry write must not fail a clinical call.
 */
export async function persistLlmUsage(row: LlmUsageRow): Promise<void> {
  logger.info({ event: "llm.usage", ...row });
  const delegate = llmUsageDelegate();
  if (!delegate) return; // table not present in this generated client yet
  try {
    await delegate.create({
      data: { ...row, errorCode: row.errorCode ?? null },
    });
  } catch (err) {
    logger.warn({
      event: "llm.usage.persist_failed",
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Sum tokens (in + out) for an org since `since`. Returns 0 if unavailable. */
export async function sumTokensSince(
  organizationId: string,
  since: Date,
): Promise<number> {
  const delegate = llmUsageDelegate();
  if (!delegate) return 0;
  try {
    const agg = await delegate.aggregate({
      where: { organizationId, createdAt: { gte: since } },
      _sum: { tokensIn: true, tokensOut: true },
    });
    return (agg._sum.tokensIn ?? 0) + (agg._sum.tokensOut ?? 0);
  } catch {
    return 0;
  }
}

/** Tokens used month-to-date (calendar month, server-local). */
export async function sumTokensMTD(organizationId: string): Promise<number> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  return sumTokensSince(organizationId, monthStart);
}
