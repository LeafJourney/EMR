import { describe, it, expect } from "vitest";
import { buildChartGeometry, nearestPointIndex, type ChartGeom } from "./widgets";

const GEOM: ChartGeom = { w: 620, h: 188, padL: 4, padR: 4, padT: 10, padB: 22 };
// inner width = 612, inner height = 156, baseline y = padT + ih = 166

describe("buildChartGeometry", () => {
  it("centers a single-point series horizontally", () => {
    const { points } = buildChartGeometry([1.5], GEOM);
    expect(points).toHaveLength(1);
    expect(points[0].x).toBeCloseTo(310, 5); // padL + iw/2 = 4 + 612/2
  });

  it("places the first and last points at the inner edges", () => {
    const { points } = buildChartGeometry([1, 2, 3], GEOM, 4);
    expect(points[0].x).toBeCloseTo(4, 5);
    expect(points[2].x).toBeCloseTo(616, 5);
  });

  it("maps yMax to the top padding and 0 to the baseline", () => {
    const { points, baseY } = buildChartGeometry([0, 2], GEOM, 2);
    expect(baseY).toBe(166);
    expect(points[1].y).toBeCloseTo(10, 5); // v === yMax -> padT
    expect(points[0].y).toBeCloseTo(166, 5); // v === 0 -> baseline
  });

  it("carries the original value and index on each point", () => {
    const { points } = buildChartGeometry([1.21, 1.84], GEOM, 2);
    expect(points.map((p) => p.v)).toEqual([1.21, 1.84]);
    expect(points.map((p) => p.i)).toEqual([0, 1]);
  });

  it("builds a closed area path that returns to the baseline", () => {
    const { area, baseY } = buildChartGeometry([1, 2], GEOM, 2);
    expect(area.startsWith("M")).toBe(true);
    expect(area.trim().endsWith("Z")).toBe(true);
    expect(area).toContain(baseY.toFixed(1)); // "166.0"
  });

  it("returns empty geometry (no points, empty area) for an empty series", () => {
    const { points, area, line } = buildChartGeometry([], GEOM);
    expect(points).toHaveLength(0);
    expect(area).toBe("");
    expect(line).toBe("");
  });
});

describe("nearestPointIndex", () => {
  const pts = [{ x: 0 }, { x: 100 }, { x: 200 }, { x: 300 }];

  it("returns the closest point to the cursor", () => {
    expect(nearestPointIndex(0, pts)).toBe(0);
    expect(nearestPointIndex(140, pts)).toBe(1);
    expect(nearestPointIndex(160, pts)).toBe(2);
    expect(nearestPointIndex(999, pts)).toBe(3);
  });

  it("clamps positions left of the first point to index 0", () => {
    expect(nearestPointIndex(-50, pts)).toBe(0);
  });

  it("returns -1 for an empty series", () => {
    expect(nearestPointIndex(10, [])).toBe(-1);
  });
});
