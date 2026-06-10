import { describe, expect, it } from "vitest";
import {
  type MarkupPolicy,
  computeEconomics,
  customerMonthlyPrice,
  priceBasis,
  projectMonthlyForModel,
  resolveMarkupPolicy,
} from "./usage-economics";

const keystone: MarkupPolicy = { multiplier: 2, floorUsd: 20 };
const fiftyPct: MarkupPolicy = { multiplier: 1.5, floorUsd: 20 };

describe("customerMonthlyPrice", () => {
  it("applies the floor when marked-up cost is below it", () => {
    // $5 raw × 2 = $10 → floored to $20.
    expect(customerMonthlyPrice(5, keystone)).toBe(20);
  });

  it("applies the markup once it clears the floor", () => {
    // $200 raw × 1.5 = $300 (the physician-pays-$300 example).
    expect(customerMonthlyPrice(200, fiftyPct)).toBe(300);
  });

  it("uses the keystone 2x by default", () => {
    expect(customerMonthlyPrice(50)).toBe(100);
  });
});

describe("priceBasis", () => {
  it("is 'floor' below the floor and 'markup' above", () => {
    expect(priceBasis(5, keystone)).toBe("floor");
    expect(priceBasis(50, keystone)).toBe("markup");
  });
});

describe("computeEconomics", () => {
  it("treats provider cost as the reference cost when no discount is given", () => {
    const e = computeEconomics({ referenceRawCostUsd: 200, policy: fiftyPct });
    expect(e.customerPriceUsd).toBe(300);
    expect(e.providerCostUsd).toBe(200);
    expect(e.grossMarginUsd).toBe(100);
    expect(e.grossMarginPct).toBeCloseTo(100 / 300, 10);
    expect(e.basis).toBe("markup");
  });

  it("expands margin as the negotiated provider cost drops (arbitrage)", () => {
    // Customer fee holds at $300; we negotiate the real cost down to $120.
    const e = computeEconomics({
      referenceRawCostUsd: 200,
      providerActualCostUsd: 120,
      policy: fiftyPct,
    });
    expect(e.customerPriceUsd).toBe(300); // unchanged for the customer
    expect(e.providerCostUsd).toBe(120);
    expect(e.grossMarginUsd).toBe(180); // margin grew from $100 → $180
    expect(e.grossMarginPct).toBeCloseTo(180 / 300, 10);
  });

  it("reports zero margin pct for a zero-price (free/local) projection", () => {
    const e = computeEconomics({
      referenceRawCostUsd: 0,
      policy: { multiplier: 2, floorUsd: 0 },
    });
    expect(e.customerPriceUsd).toBe(0);
    expect(e.grossMarginPct).toBe(0);
  });
});

describe("resolveMarkupPolicy", () => {
  it("falls back to the 2x platform default when unset", () => {
    expect(resolveMarkupPolicy().multiplier).toBe(2);
    expect(resolveMarkupPolicy({ multiplier: null }).multiplier).toBe(2);
    expect(resolveMarkupPolicy({}).floorUsd).toBe(20);
  });

  it("honors a valid per-account override (e.g. 1.5x at setup)", () => {
    const p = resolveMarkupPolicy({ multiplier: 1.5 });
    expect(p.multiplier).toBe(1.5);
    expect(customerMonthlyPrice(200, p)).toBe(300);
  });

  it("ignores a non-positive or non-finite multiplier rather than trusting it", () => {
    expect(resolveMarkupPolicy({ multiplier: 0 }).multiplier).toBe(2);
    expect(resolveMarkupPolicy({ multiplier: -3 }).multiplier).toBe(2);
    expect(resolveMarkupPolicy({ multiplier: Number.NaN }).multiplier).toBe(2);
  });

  it("allows a per-account floor override", () => {
    expect(resolveMarkupPolicy({ floorUsd: 50 }).floorUsd).toBe(50);
    expect(resolveMarkupPolicy({ floorUsd: -1 }).floorUsd).toBe(20);
  });
});

describe("projectMonthlyForModel", () => {
  it("projects a flat fee from the agent fleet's token estimates", () => {
    const p = projectMonthlyForModel({ costPer1kTokens: 0.003 });
    expect(p.projectedTokens).toBeGreaterThan(0);
    expect(p.referenceRawCostUsd).toBeGreaterThan(0);
    // Customer price is the marked-up reference, never below the floor.
    expect(p.customerPriceUsd).toBeGreaterThanOrEqual(20);
    expect(p.customerPriceUsd).toBeGreaterThanOrEqual(p.referenceRawCostUsd);
  });

  it("scales with the chosen foundation model's token cost", () => {
    const cheap = projectMonthlyForModel({ costPer1kTokens: 0.0001 });
    const premium = projectMonthlyForModel({ costPer1kTokens: 0.018 });
    expect(premium.referenceRawCostUsd).toBeGreaterThan(cheap.referenceRawCostUsd);
    // Same fleet → identical projected token volume regardless of price.
    expect(premium.projectedTokens).toBe(cheap.projectedTokens);
  });

  it("a free/local model floors to the platform minimum", () => {
    const p = projectMonthlyForModel({ costPer1kTokens: 0 });
    expect(p.referenceRawCostUsd).toBe(0);
    expect(p.customerPriceUsd).toBe(20);
    expect(p.basis).toBe("floor");
  });

  it("honors an enabled-agent subset", () => {
    const all = projectMonthlyForModel({ costPer1kTokens: 0.003 });
    const subset = projectMonthlyForModel(
      { costPer1kTokens: 0.003 },
      { enabledAgentIds: [] },
    );
    expect(subset.projectedTokens).toBe(0);
    expect(subset.referenceRawCostUsd).toBe(0);
    expect(all.projectedTokens).toBeGreaterThan(subset.projectedTokens);
  });
});
