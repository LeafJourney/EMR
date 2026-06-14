// Telemetry normalization — daily downsampling, σ_cgm, ΔHRV (EMR-1127).

import { describe, expect, it } from "vitest";
import {
  coefficientOfVariationPct,
  downsampleToDaily,
  median,
  normalizeTelemetry,
} from "../normalize";
import type { TelemetryPoint } from "../types";

const NOW = new Date("2026-06-14T12:00:00.000Z");
const DAY = 86_400_000;

/** Build N readings on the day `daysAgo` before NOW, each with `value`. */
function dayReadings(daysAgo: number, values: number[]): TelemetryPoint[] {
  const base = NOW.getTime() - daysAgo * DAY;
  return values.map((value, i) => ({
    at: new Date(base + i * 3_600_000),
    value,
  }));
}

describe("downsampleToDaily", () => {
  it("averages multiple readings within a UTC day and sorts ascending", () => {
    const points: TelemetryPoint[] = [
      ...dayReadings(2, [100, 120]), // mean 110
      ...dayReadings(1, [90, 110, 130]), // mean 110
      ...dayReadings(3, [200]), // mean 200, oldest
    ];
    const daily = downsampleToDaily(points);
    expect(daily).toHaveLength(3);
    expect(daily[0].mean).toBe(200); // day 3 sorts first
    expect(daily[2].mean).toBe(110); // most recent day
  });

  it("skips non-finite values and timestamps", () => {
    const daily = downsampleToDaily([
      { at: "not-a-date", value: 100 },
      { at: NOW, value: Number.NaN },
      { at: NOW, value: 95 },
    ]);
    expect(daily).toHaveLength(1);
    expect(daily[0].mean).toBe(95);
  });
});

describe("median", () => {
  it("handles odd and even lengths and ignores non-finite", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([Number.NaN, 5])).toBe(5);
    expect(median([])).toBeNull();
  });
});

describe("coefficientOfVariationPct", () => {
  it("returns σ/μ × 100 and null for degenerate inputs", () => {
    // values [90,110]: mean 100, pop/std 10 → CV 10%
    expect(coefficientOfVariationPct([90, 110])).toBeCloseTo(10, 6);
    expect(coefficientOfVariationPct([5])).toBeNull(); // need ≥2
    expect(coefficientOfVariationPct([0, 0])).toBeNull(); // zero mean
  });
});

describe("normalizeTelemetry", () => {
  it("computes σ_cgm only over the 14-day window", () => {
    const cgm: TelemetryPoint[] = [
      ...dayReadings(1, [90]),
      ...dayReadings(2, [110]), // in-window → CV of [90,110] = 10%
      ...dayReadings(40, [10]), // ancient, excluded
    ];
    const norm = normalizeTelemetry({ cgm }, NOW);
    expect(norm.cgmDays).toBe(2);
    expect(norm.cgmVariabilityPct).toBeCloseTo(10, 6);
  });

  it("measures ΔHRV as baseline-minus-recent, never negative", () => {
    const nocturnalHrv: TelemetryPoint[] = [
      ...dayReadings(2, [40]), // recent (<7d) median 40
      ...dayReadings(20, [60]), // baseline (7–30d) median 60
    ];
    const norm = normalizeTelemetry({ nocturnalHrv }, NOW);
    expect(norm.hrvReductionMs).toBe(20); // 60 − 40

    // Improving HRV (recent higher) clamps to 0, not a negative "risk credit".
    const improving = normalizeTelemetry(
      {
        nocturnalHrv: [...dayReadings(2, [70]), ...dayReadings(20, [50])],
      },
      NOW
    );
    expect(improving.hrvReductionMs).toBe(0);
  });

  it("returns nulls when telemetry is absent", () => {
    const norm = normalizeTelemetry(undefined, NOW);
    expect(norm.cgmVariabilityPct).toBeNull();
    expect(norm.hrvReductionMs).toBeNull();
    expect(norm.cgmDays).toBe(0);
  });

  it("yields no ΔHRV without baseline data older than the recent window", () => {
    const norm = normalizeTelemetry(
      { nocturnalHrv: dayReadings(1, [45]) }, // only recent, no baseline
      NOW
    );
    expect(norm.hrvReductionMs).toBeNull();
  });
});
