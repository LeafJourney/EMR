// Phase 0 (telemetry) — LLM usage pricing.
//
// The `byok` provider catalog already carries a blended `costPer1kTokens` for
// every model we offer. That catalog IS the price book — this module is the
// thin adapter that turns (model, tokens) into the integer `costMicroCents`
// the LlmUsage ledger stores. Until this landed, every usage row was written
// at null cost, so the entire cost-rollup pipeline (summarizeLlmUsage →
// getOrgUsageSummary → /api/saas/usage) had real token counts but no dollars.
//
// Unit convention: LlmUsage.costMicroCents is in micro-cents (1e-8 USD each),
// an integer to avoid float drift. 1 USD = 1e8 micro-cents.

import { findModel } from "@/lib/domain/byok";

/** Micro-cents per US dollar. costMicroCents stores 1e-8 USD per unit. */
export const MICRO_CENTS_PER_USD = 100_000_000;

/**
 * Price a single model call into integer micro-cents using the byok catalog.
 *
 * Returns `null` when the model id is unknown to the catalog — we never
 * fabricate a price. A `null` is meaningfully different from `0`: zero is a
 * priced free/local/stub model, null is "we have no price book entry for this
 * model". Downstream roll-ups already treat `null` as "uncosted" rather than
 * free, so an unknown model shows tokens-without-dollars instead of silently
 * reading as $0.00 spend.
 *
 * `costPer1kTokens` in the catalog is a blended input+output rate, so we price
 * the combined token volume rather than splitting in/out.
 */
export function priceUsageMicroCents(
  model: string,
  tokensIn: number,
  tokensOut: number,
): number | null {
  const entry = findModel(model);
  if (!entry) return null;

  const totalTokens = Math.max(0, tokensIn) + Math.max(0, tokensOut);
  if (totalTokens === 0) return 0;

  const usd = (totalTokens / 1000) * entry.costPer1kTokens;
  return Math.round(usd * MICRO_CENTS_PER_USD);
}

/** Convert stored micro-cents back to USD (float, for display/formatting). */
export function microCentsToUsd(microCents: number | null | undefined): number {
  if (!microCents) return 0;
  return microCents / MICRO_CENTS_PER_USD;
}

/**
 * Format micro-cents as a USD string. Sub-cent spend (common for budget models
 * on short calls) keeps four decimals so it never collapses to "$0.00"; once
 * spend crosses a cent we show standard currency precision.
 */
export function formatUsdFromMicroCents(microCents: number | null | undefined): string {
  const usd = microCentsToUsd(microCents);
  if (usd > 0 && usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
