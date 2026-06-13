import { describe, expect, it } from "vitest";

import { buildRunwayTrend } from "./cash-flow-runway";

describe("buildRunwayTrend", () => {
  it("projects a finite runway toward zero over the burn horizon", () => {
    const trend = buildRunwayTrend({
      openingCashCents: 60_000_00,
      closingCashCents: 30_000_00,
      netChangeCents: -30_000_00,
      burnRateCentsPerDay: 100_000,
      runwayDays: 30,
    });

    expect(trend.projectedCashCents).toBe(0);
    expect(trend.tone).toBe("bad");
    expect(trend.caption).toBe("30d runway at current burn");
    expect(trend.points).toHaveLength(3);
    expect(trend.points[0].x).toBe(0);
    expect(trend.points[2].x).toBe(100);
    expect(trend.points[0].y).toBeLessThan(trend.points[1].y);
    expect(trend.points[1].y).toBeLessThan(trend.points[2].y);
  });

  it("projects a positive cash trend forward by the current net change", () => {
    const trend = buildRunwayTrend({
      openingCashCents: 10_000_00,
      closingCashCents: 12_000_00,
      netChangeCents: 2_000_00,
      burnRateCentsPerDay: 0,
      runwayDays: null,
    });

    expect(trend.projectedCashCents).toBe(14_000_00);
    expect(trend.tone).toBe("good");
    expect(trend.caption).toBe("Positive cash trend");
    expect(trend.points[0].y).toBeGreaterThan(trend.points[1].y);
    expect(trend.points[1].y).toBeGreaterThan(trend.points[2].y);
  });
});
