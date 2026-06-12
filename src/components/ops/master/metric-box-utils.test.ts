import { describe, it, expect } from "vitest";
import {
  cycleChartType,
  summarizeSeries,
  formatMetricValue,
  METRIC_CHART_TYPES,
  type MetricChartType,
} from "./metric-box-utils";

describe("cycleChartType", () => {
  it("cycles line → area → bar → line", () => {
    expect(cycleChartType("line")).toBe("area");
    expect(cycleChartType("area")).toBe("bar");
    expect(cycleChartType("bar")).toBe("line");
  });

  it("returns the first type for an unknown value (never gets stuck)", () => {
    expect(cycleChartType("pie" as MetricChartType)).toBe("line");
  });

  it("visits every chart type exactly once per full cycle", () => {
    const seen = new Set<MetricChartType>();
    let t: MetricChartType = "line";
    for (let i = 0; i < METRIC_CHART_TYPES.length; i++) {
      seen.add(t);
      t = cycleChartType(t);
    }
    expect(seen.size).toBe(METRIC_CHART_TYPES.length);
    expect(t).toBe("line"); // back to start
  });
});

describe("summarizeSeries", () => {
  it("returns null for an empty series", () => {
    expect(summarizeSeries([])).toBeNull();
  });

  it("computes min/max/avg/first/last over a multi-point series", () => {
    const s = summarizeSeries([10, 20, 30, 40])!;
    expect(s.count).toBe(4);
    expect(s.min).toBe(10);
    expect(s.max).toBe(40);
    expect(s.avg).toBe(25);
    expect(s.first).toBe(10);
    expect(s.last).toBe(40);
    expect(s.delta).toBe(30);
    expect(s.deltaPct).toBeCloseTo(300);
    expect(s.direction).toBe("up");
  });

  it("handles a single-point series (delta 0, flat)", () => {
    const s = summarizeSeries([42])!;
    expect(s.count).toBe(1);
    expect(s.min).toBe(42);
    expect(s.max).toBe(42);
    expect(s.avg).toBe(42);
    expect(s.delta).toBe(0);
    expect(s.direction).toBe("flat");
  });

  it("reports a downward direction and negative delta", () => {
    const s = summarizeSeries([100, 60])!;
    expect(s.delta).toBe(-40);
    expect(s.deltaPct).toBeCloseTo(-40);
    expect(s.direction).toBe("down");
  });

  it("returns null deltaPct when the baseline is zero (no %% possible)", () => {
    const s = summarizeSeries([0, 50])!;
    expect(s.delta).toBe(50);
    expect(s.deltaPct).toBeNull();
    expect(s.direction).toBe("up");
  });

  it("uses |first| so recovery from a negative baseline reads positive", () => {
    const s = summarizeSeries([-100, -25])!;
    expect(s.delta).toBe(75);
    expect(s.deltaPct).toBeCloseTo(75); // 75 / |−100| · 100
    expect(s.direction).toBe("up");
  });
});

describe("formatMetricValue", () => {
  it("formats whole dollars", () => {
    expect(formatMetricValue(1234, "money")).toBe("$1,234");
  });

  it("formats cents as dollars", () => {
    expect(formatMetricValue(123400, "moneyCents")).toBe("$1,234");
  });

  it("formats percentages with at most one decimal", () => {
    expect(formatMetricValue(12.34, "percent")).toBe("12.3%");
    expect(formatMetricValue(50, "percent")).toBe("50%");
  });

  it("formats compact large numbers", () => {
    expect(formatMetricValue(1200, "compact")).toBe("1.2K");
  });

  it("formats plain numbers with grouping", () => {
    expect(formatMetricValue(1234567, "number")).toBe("1,234,567");
  });

  it("passes through non-finite values untouched", () => {
    expect(formatMetricValue("n/a", "money")).toBe("n/a");
  });
});
