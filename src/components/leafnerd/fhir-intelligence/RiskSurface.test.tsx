import { describe, it, expect } from "vitest";
import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import RiskSurface, {
  generateClusterPatients,
  kMeans,
  convexHull,
} from "./RiskSurface";

// Sibling components (primitives.tsx / widgets.tsx) lean on Next's automatic JSX
// runtime and don't `import React`, so under vitest's classic transform `React`
// is a free global. Provide it so the SSR render below can mount the full tree.
(globalThis as unknown as { React?: typeof React }).React ??= React;

describe("RiskSurface — population risk map helpers", () => {
  it("generates a stable, deterministic patient slice (SSR-safe)", () => {
    const a = generateClusterPatients();
    const b = generateClusterPatients();
    // 34+28+26+28+20+22 = 158 patients across the six latent cohorts
    expect(a).toHaveLength(158);
    // identical across calls — no Math.random/Date.now drift between renders
    expect(b).toEqual(a);
  });

  it("keeps every projected patient inside the embedding bounds", () => {
    for (const p of generateClusterPatients()) {
      expect(p.x).toBeGreaterThanOrEqual(3);
      expect(p.x).toBeLessThanOrEqual(97);
      expect(p.y).toBeGreaterThanOrEqual(3);
      expect(p.y).toBeLessThanOrEqual(97);
      expect(p.risk).toBeGreaterThanOrEqual(0.05);
      expect(p.risk).toBeLessThanOrEqual(0.99);
      expect(p.comorbidities.length).toBeGreaterThan(0);
      expect(p.initials).toHaveLength(2);
    }
  });

  it("k-means partitions every point into exactly k non-empty clusters", () => {
    const points = generateClusterPatients().map((p) => ({ x: p.x, y: p.y }));
    for (const k of [3, 4, 5, 6]) {
      const { assignments, centroids } = kMeans(points, k);
      expect(centroids).toHaveLength(k);
      expect(assignments).toHaveLength(points.length);
      const used = new Set(assignments);
      expect(used.size).toBe(k); // no empty clusters for this separable data
      for (const a of assignments) {
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThan(k);
      }
    }
  });

  it("k-means is deterministic for a given k", () => {
    const points = generateClusterPatients().map((p) => ({ x: p.x, y: p.y }));
    expect(kMeans(points, 4).assignments).toEqual(kMeans(points, 4).assignments);
  });

  it("convexHull returns the four corners for an axis-aligned square", () => {
    const hull = convexHull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 5, y: 5 }, // interior point must be excluded
    ]);
    expect(hull).toHaveLength(4);
    expect(hull).not.toContainEqual({ x: 5, y: 5 });
  });

  it("convexHull degrades gracefully for < 3 points", () => {
    expect(convexHull([])).toEqual([]);
    expect(convexHull([{ x: 1, y: 2 }])).toEqual([{ x: 1, y: 2 }]);
  });

  it("renders the surface (incl. the cluster map) to static markup without throwing", () => {
    const html = renderToStaticMarkup(
      createElement(RiskSurface, {
        openDrawer: { patient: () => {} },
        toast: () => {},
      }),
    );
    expect(html).toContain("Population risk map");
    expect(html).toContain("<svg"); // the embedding canvas mounted
    expect(html).toContain("Cluster A"); // default k-means legend rendered
    // 158 patient dots + assorted scaffolding circles all serialized cleanly
    expect((html.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(158);
  });
});
