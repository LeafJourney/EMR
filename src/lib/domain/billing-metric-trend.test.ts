import { describe, it, expect } from "vitest";
import { buildMetricTrend, type TrendEvent } from "./billing-metric-trend";

function ev(
  id: string,
  type: string,
  amountCents: number,
  iso: string,
  description = type,
): TrendEvent {
  return { id, type, amountCents, occurredAt: new Date(iso), description };
}

describe("buildMetricTrend", () => {
  it("returns empty series when no events contribute to the metric", () => {
    const events = [ev("1", "statement_viewed", 0, "2026-01-15")];
    const trend = buildMetricTrend("total_balance", events);
    expect(trend.points).toEqual([]);
    expect(trend.lineItems).toEqual([]);
  });

  it("accumulates a patient-owed ledger using explicit direction, not the stored sign", () => {
    // Both stored as positive magnitudes; direction map decides the sign.
    const events = [
      ev("a", "patient_responsibility_transferred", 10000, "2026-02-10"),
      ev("b", "patient_payment", 4000, "2026-03-05"),
    ];
    const trend = buildMetricTrend("patient_due", events);
    expect(trend.points).toHaveLength(2); // Feb, Mar
    expect(trend.points[0]).toMatchObject({
      monthKey: "2026-02",
      cumulativeCents: 10000,
    });
    expect(trend.points[1]).toMatchObject({
      monthKey: "2026-03",
      cumulativeCents: 6000, // 10000 owed - 4000 paid
    });
  });

  it("carries the running total forward across months with no activity", () => {
    const events = [
      ev("a", "charge_created", 20000, "2026-01-10"),
      ev("b", "patient_payment", 5000, "2026-04-10"),
    ];
    const trend = buildMetricTrend("total_balance", events);
    // Jan, Feb, Mar, Apr — Feb/Mar carry Jan's balance forward.
    expect(trend.points.map((p) => p.monthKey)).toEqual([
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
    expect(trend.points.map((p) => p.cumulativeCents)).toEqual([
      20000, 20000, 20000, 15000,
    ]);
  });

  it("ignores event types not mapped to the metric", () => {
    const events = [
      ev("a", "copay_collected", 2500, "2026-01-10"),
      ev("b", "insurance_paid", 9000, "2026-01-12"), // not in copay map
    ];
    const trend = buildMetricTrend("copay_collected", events);
    expect(trend.lineItems).toHaveLength(1);
    expect(trend.points.at(-1)?.cumulativeCents).toBe(2500);
  });

  it("orders line items most-recent-first and labels months", () => {
    const events = [
      ev("a", "claim_submitted", 30000, "2026-05-01", "May claim"),
      ev("b", "insurance_paid", 12000, "2026-06-01", "June payment"),
    ];
    const trend = buildMetricTrend("insurance_pending", events);
    expect(trend.lineItems.map((i) => i.id)).toEqual(["b", "a"]);
    expect(trend.points[0].label).toBe("May '26");
    expect(trend.points.at(-1)?.cumulativeCents).toBe(18000); // 30000 - 12000
  });
});
