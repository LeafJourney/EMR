// EMR-724 — SaaS billing & AI brokering: usage ledger reader/writer (server).
//
// `persistLlmUsage` is the durable sink the AI broker writes on every upstream
// call (success and failure). `getOrgUsageSummary` powers the per-org cost
// dashboard. Both are best-effort on the write path — an accounting miss must
// never take down the PHI/agent call it meters (matches audit-logger.ts).

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import {
  type LlmUsageRow,
  type LlmUsageSummary,
  summarizeLlmUsage,
} from "./llm-usage-logic";

const DAY_MS = 86_400_000;
const ROW_CAP = 50_000;

export interface PersistLlmUsageInput {
  organizationId: string;
  agentBucket: string;
  agentName: string;
  model: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  ok: boolean;
  errorCode?: string;
  costMicroCents?: number | null;
}

/**
 * Append one usage row. Swallows on failure (logging it) so metering can never
 * break the broker call it accounts for.
 */
export async function persistLlmUsage(
  input: PersistLlmUsageInput,
): Promise<void> {
  try {
    await prisma.llmUsage.create({
      data: {
        organizationId: input.organizationId,
        agentBucket: input.agentBucket,
        agentName: input.agentName,
        model: input.model,
        tokensIn: input.tokensIn,
        tokensOut: input.tokensOut,
        costMicroCents: input.costMicroCents ?? null,
        latencyMs: input.latencyMs,
        ok: input.ok,
        errorCode: input.errorCode ?? null,
      },
    });
  } catch (err) {
    logger.error({
      event: "llm.usage.persist_failed",
      organizationId: input.organizationId,
      agentName: input.agentName,
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Roll up an org's token consumption since `since` (default: trailing 30d). */
export async function getOrgUsageSummary(
  organizationId: string,
  since: Date = new Date(Date.now() - 30 * DAY_MS),
): Promise<LlmUsageSummary> {
  const rows = await prisma.llmUsage.findMany({
    where: { organizationId, createdAt: { gte: since } },
    select: {
      agentBucket: true,
      agentName: true,
      model: true,
      tokensIn: true,
      tokensOut: true,
      costMicroCents: true,
      ok: true,
    },
    take: ROW_CAP,
  });
  return summarizeLlmUsage(rows as LlmUsageRow[]);
}
