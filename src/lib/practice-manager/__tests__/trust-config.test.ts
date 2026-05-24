/**
 * Trust threshold + role-based approval routing — EMR-793
 *
 * Covers the contract the supply-reorder state machine will rely on:
 *  - default ceilings when settings are absent / malformed
 *  - parsed values when settings are present
 *  - shouldAutoSubmit under / over per-order ceiling
 *  - shouldAutoSubmit over per-day ceiling (even if under per-order)
 *  - explanatory `reason` strings
 */

import { describe, expect, it } from "vitest";

import {
  DEFAULT_APPROVERS,
  DEFAULT_PER_DAY_CEILING_CENTS,
  DEFAULT_PER_ORDER_CEILING_CENTS,
  loadTrustConfig,
  routeApprovers,
  shouldAutoSubmit,
} from "@/lib/practice-manager/trust-config";

describe("loadTrustConfig — defaults", () => {
  it("returns defaults when settings is undefined", () => {
    const cfg = loadTrustConfig(undefined);
    expect(cfg.perOrderCeilingCents).toBe(DEFAULT_PER_ORDER_CEILING_CENTS);
    expect(cfg.perDayCeilingCents).toBe(DEFAULT_PER_DAY_CEILING_CENTS);
    expect(cfg.approvers).toEqual(DEFAULT_APPROVERS);
  });

  it("returns defaults when settings is not an object", () => {
    expect(loadTrustConfig(null).perOrderCeilingCents).toBe(50_000);
    expect(loadTrustConfig("string").perOrderCeilingCents).toBe(50_000);
    expect(loadTrustConfig(42).perOrderCeilingCents).toBe(50_000);
    expect(loadTrustConfig([]).perOrderCeilingCents).toBe(50_000);
  });

  it("returns defaults when practiceManager key is absent", () => {
    const cfg = loadTrustConfig({ unrelated: { foo: 1 } });
    expect(cfg.perOrderCeilingCents).toBe(DEFAULT_PER_ORDER_CEILING_CENTS);
    expect(cfg.perDayCeilingCents).toBe(DEFAULT_PER_DAY_CEILING_CENTS);
  });

  it("falls back to defaults for individual malformed fields", () => {
    const cfg = loadTrustConfig({
      practiceManager: {
        perOrderCeilingCents: "huge", // wrong type
        perDayCeilingCents: -100, // negative
        approvers: "not-an-array",
      },
    });
    expect(cfg.perOrderCeilingCents).toBe(DEFAULT_PER_ORDER_CEILING_CENTS);
    expect(cfg.perDayCeilingCents).toBe(DEFAULT_PER_DAY_CEILING_CENTS);
    expect(cfg.approvers).toEqual(DEFAULT_APPROVERS);
  });
});

describe("loadTrustConfig — parsed values", () => {
  it("reads explicit ceilings from settings", () => {
    const cfg = loadTrustConfig({
      practiceManager: {
        perOrderCeilingCents: 75_000,
        perDayCeilingCents: 400_000,
      },
    });
    expect(cfg.perOrderCeilingCents).toBe(75_000);
    expect(cfg.perDayCeilingCents).toBe(400_000);
  });

  it("reads approvers with role + userIds", () => {
    const cfg = loadTrustConfig({
      practiceManager: {
        approvers: [
          { role: "practice_owner", userIds: ["u1", "u2"] },
          { role: "operator" },
          { role: "not_a_real_role" }, // dropped
        ],
      },
    });
    expect(cfg.approvers).toEqual([
      { role: "practice_owner", userIds: ["u1", "u2"] },
      { role: "operator" },
    ]);
  });

  it("floors fractional ceilings to integers", () => {
    const cfg = loadTrustConfig({
      practiceManager: { perOrderCeilingCents: 50_000.99 },
    });
    expect(cfg.perOrderCeilingCents).toBe(50_000);
  });
});

describe("shouldAutoSubmit — per-order ceiling", () => {
  const config = loadTrustConfig(undefined);

  it("auto-submits under the per-order ceiling", () => {
    const result = shouldAutoSubmit({
      orderTotalCents: 25_000,
      dayRunningTotalCents: 0,
      config,
    });
    expect(result.autoSubmit).toBe(true);
    expect(result.reason).toContain("within_ceilings");
  });

  it("auto-submits exactly AT the per-order ceiling", () => {
    const result = shouldAutoSubmit({
      orderTotalCents: 50_000,
      dayRunningTotalCents: 0,
      config,
    });
    expect(result.autoSubmit).toBe(true);
  });

  it("routes to approval when over the per-order ceiling", () => {
    const result = shouldAutoSubmit({
      orderTotalCents: 50_001,
      dayRunningTotalCents: 0,
      config,
    });
    expect(result.autoSubmit).toBe(false);
    expect(result.reason).toContain("over_per_order_ceiling");
    expect(result.reason).toContain("50001");
  });
});

describe("shouldAutoSubmit — per-day ceiling", () => {
  const config = loadTrustConfig(undefined);

  it("routes to approval when the daily projection would exceed the day ceiling, even though per-order is fine", () => {
    const result = shouldAutoSubmit({
      orderTotalCents: 40_000, // under $500 per-order ceiling
      dayRunningTotalCents: 180_000, // already $1800 used today
      config,
    });
    expect(result.autoSubmit).toBe(false);
    expect(result.reason).toContain("over_per_day_ceiling");
    // 180000 + 40000 = 220000 > 200000
    expect(result.reason).toContain("220000");
  });

  it("auto-submits when projected day total exactly equals the day ceiling", () => {
    const result = shouldAutoSubmit({
      orderTotalCents: 20_000,
      dayRunningTotalCents: 180_000,
      config,
    });
    expect(result.autoSubmit).toBe(true);
  });
});

describe("shouldAutoSubmit — defensive", () => {
  const config = loadTrustConfig(undefined);

  it("refuses negative or NaN order totals", () => {
    expect(shouldAutoSubmit({ orderTotalCents: -1, dayRunningTotalCents: 0, config }).autoSubmit).toBe(false);
    expect(shouldAutoSubmit({ orderTotalCents: Number.NaN, dayRunningTotalCents: 0, config }).autoSubmit).toBe(false);
  });
});

describe("routeApprovers", () => {
  it("returns the configured roles in order, omitting empty userIds", () => {
    const cfg = loadTrustConfig({
      practiceManager: {
        approvers: [
          { role: "practice_owner", userIds: ["u1"] },
          { role: "operator", userIds: [] },
        ],
      },
    });
    expect(routeApprovers(cfg)).toEqual([
      { role: "practice_owner", userIds: ["u1"] },
      { role: "operator" },
    ]);
  });

  it("falls back to practice_owner when no approvers configured", () => {
    expect(routeApprovers(loadTrustConfig(undefined))).toEqual([{ role: "practice_owner" }]);
  });
});
