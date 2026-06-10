// Phase 1 — usage economics (pure business logic).
//
// This codifies the LeafJourney revenue model so it's baked in from the start:
// give the software away, charge for metered + marked-up token usage, billed as
// a *predictable* flat monthly fee through the membership.
//
// The model rests on THREE distinct numbers — keeping them separate is what
// makes the volume-discount arbitrage work:
//
//   1. referenceRawCostUsd — the list/catalog token cost the customer's price
//      is derived from (byok costPer1kTokens). Stable; what the customer would
//      pay "at the meter".
//   2. customerPriceUsd     — what the practice actually pays = reference cost
//      × markup, floored. A flat, predictable monthly fee; the physician never
//      sees the per-token upcharge.
//   3. providerCostUsd      — what LeafJourney actually pays the model maker /
//      OpenRouter. Starts equal to the reference cost, but DROPS as we
//      negotiate volume discounts.
//
// Gross margin = customerPrice − providerCost. As volume discounts land, the
// provider cost falls while the customer's predictable fee holds, so margin
// expands silently. Built in here on day one so the platform can ride that
// curve without a pricing rewrite.

import {
  AGENT_CATALOG,
  LEAFJOURNEY_PRICE_FLOOR_USD,
  LEAFJOURNEY_PRICE_MULTIPLIER,
  monthlyCostForAgent,
  type AgentCatalogEntry,
  type ModelOption,
} from "@/lib/domain/byok";

/**
 * How reference token cost becomes the customer's price. A single tunable knob
 * — today the keystone (2× over a $20 floor); set `multiplier` to 1.5 for the
 * "50% markup" variant, or override per tier later — without touching callers.
 */
export interface MarkupPolicy {
  /** Customer price = referenceRawCost × multiplier (before the floor). */
  multiplier: number;
  /** Never bill below this monthly floor (USD). */
  floorUsd: number;
}

export const DEFAULT_MARKUP_POLICY: MarkupPolicy = {
  multiplier: LEAFJOURNEY_PRICE_MULTIPLIER,
  floorUsd: LEAFJOURNEY_PRICE_FLOOR_USD,
};

/**
 * Resolve the markup policy for an account. The multiplier is a per-account
 * commercial term set at account setup (PracticeSubscription.aiMarkupMultiplier)
 * — null/undefined falls back to the platform default (2×). A non-positive or
 * non-finite override is ignored rather than trusted, so a bad value can never
 * zero out or invert a customer's price.
 */
export function resolveMarkupPolicy(
  override?: { multiplier?: number | null; floorUsd?: number | null },
): MarkupPolicy {
  const multiplier =
    override?.multiplier != null &&
    Number.isFinite(override.multiplier) &&
    override.multiplier > 0
      ? override.multiplier
      : DEFAULT_MARKUP_POLICY.multiplier;
  const floorUsd =
    override?.floorUsd != null &&
    Number.isFinite(override.floorUsd) &&
    override.floorUsd >= 0
      ? override.floorUsd
      : DEFAULT_MARKUP_POLICY.floorUsd;
  return { multiplier, floorUsd };
}

export type PriceBasis = "floor" | "markup";

/** Customer-facing monthly price from a reference (list) raw monthly cost. */
export function customerMonthlyPrice(
  referenceRawCostUsd: number,
  policy: MarkupPolicy = DEFAULT_MARKUP_POLICY,
): number {
  const marked = Math.max(0, referenceRawCostUsd) * policy.multiplier;
  return Math.max(policy.floorUsd, marked);
}

/** Which side of the floor the customer price lands on (for UI explanation). */
export function priceBasis(
  referenceRawCostUsd: number,
  policy: MarkupPolicy = DEFAULT_MARKUP_POLICY,
): PriceBasis {
  return Math.max(0, referenceRawCostUsd) * policy.multiplier >= policy.floorUsd
    ? "markup"
    : "floor";
}

export interface UsageEconomics {
  referenceRawCostUsd: number;
  customerPriceUsd: number;
  providerCostUsd: number;
  grossMarginUsd: number;
  /** Margin as a share of the customer price (0..1). 0 when price is 0. */
  grossMarginPct: number;
  basis: PriceBasis;
}

/**
 * Full economics for a period. `providerActualCostUsd` defaults to the
 * reference cost (no negotiated discount yet); pass the real/discounted cost to
 * see true margin once volume deals exist. This is the internal (operator /
 * super-admin) view — the customer only ever sees `customerPriceUsd`.
 */
export function computeEconomics(params: {
  referenceRawCostUsd: number;
  providerActualCostUsd?: number;
  policy?: MarkupPolicy;
}): UsageEconomics {
  const policy = params.policy ?? DEFAULT_MARKUP_POLICY;
  const referenceRawCostUsd = Math.max(0, params.referenceRawCostUsd);
  const providerCostUsd = Math.max(
    0,
    params.providerActualCostUsd ?? referenceRawCostUsd,
  );
  const customerPriceUsd = customerMonthlyPrice(referenceRawCostUsd, policy);
  const grossMarginUsd = customerPriceUsd - providerCostUsd;
  const grossMarginPct =
    customerPriceUsd > 0 ? grossMarginUsd / customerPriceUsd : 0;
  return {
    referenceRawCostUsd,
    customerPriceUsd,
    providerCostUsd,
    grossMarginUsd,
    grossMarginPct,
    basis: priceBasis(referenceRawCostUsd, policy),
  };
}

export interface MonthlyProjection {
  /** Projected tokens/month across the included agents. */
  projectedTokens: number;
  /** Reference (list) raw cost/month for that volume on the chosen model. */
  referenceRawCostUsd: number;
  /** The predictable flat monthly fee the practice would pay. */
  customerPriceUsd: number;
  basis: PriceBasis;
}

/**
 * Project a model's predictable monthly fee from the agent fleet's calibrated
 * token estimates. The practice picks the foundation model that drives agentic
 * performance; we turn that choice + the enabled fleet into a flat monthly
 * quote. Defaults to the full catalog when no enabled set is given.
 */
export function projectMonthlyForModel(
  model: Pick<ModelOption, "costPer1kTokens">,
  opts?: { enabledAgentIds?: string[]; policy?: MarkupPolicy },
): MonthlyProjection {
  const policy = opts?.policy ?? DEFAULT_MARKUP_POLICY;
  const enabled: AgentCatalogEntry[] = opts?.enabledAgentIds
    ? AGENT_CATALOG.filter((a) => opts.enabledAgentIds!.includes(a.id))
    : AGENT_CATALOG;

  let projectedTokens = 0;
  let referenceRawCostUsd = 0;
  for (const agent of enabled) {
    projectedTokens += agent.estimatedTokensPerMonth;
    referenceRawCostUsd += monthlyCostForAgent(agent, model as ModelOption);
  }

  return {
    projectedTokens,
    referenceRawCostUsd,
    customerPriceUsd: customerMonthlyPrice(referenceRawCostUsd, policy),
    basis: priceBasis(referenceRawCostUsd, policy),
  };
}
