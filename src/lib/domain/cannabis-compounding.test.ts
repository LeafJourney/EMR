import { describe, expect, it } from "vitest";
import {
  batchThcMg,
  checkThcGuardrail,
  computeFormulation,
  computeYield,
  dailyThcMg,
  parseRatio,
  type RawIngredient,
} from "./cannabis-compounding";

describe("parseRatio", () => {
  it("parses the names-then-values form", () => {
    expect(parseRatio("CBD:THC:CBN = 20:1:2")).toEqual({ CBD: 20, THC: 1, CBN: 2 });
  });

  it("parses inline name+number pairs in either order", () => {
    expect(parseRatio("CBD 20, THC 1, CBN 2")).toEqual({ CBD: 20, THC: 1, CBN: 2 });
    expect(parseRatio("20 CBD : 1 THC : 2 CBN")).toEqual({ CBD: 20, THC: 1, CBN: 2 });
    expect(parseRatio("CBD20 THC1")).toEqual({ CBD: 20, THC: 1 });
  });

  it("is case-insensitive and supports decimals", () => {
    expect(parseRatio("cbd 1 : thc 0.5")).toEqual({ CBD: 1, THC: 0.5 });
  });

  it("throws on an unparseable spec", () => {
    expect(() => parseRatio("no cannabinoids here")).toThrow(/Unparseable/);
  });
});

describe("computeFormulation", () => {
  const f = computeFormulation({
    ratio: { CBD: 20, THC: 1, CBN: 2 },
    totalCannabinoidMgPerMl: 50,
    batchVolumeMl: 30,
  });

  it("splits total concentration across constituents by ratio", () => {
    const cbd = f.constituents.find((c) => c.cannabinoid === "CBD")!;
    const thc = f.constituents.find((c) => c.cannabinoid === "THC")!;
    const cbn = f.constituents.find((c) => c.cannabinoid === "CBN")!;
    expect(f.totalParts).toBe(23);
    expect(cbd.mgPerMl).toBeCloseTo((50 * 20) / 23, 6);
    expect(thc.mgPerMl).toBeCloseTo((50 * 1) / 23, 6);
    expect(cbn.mgPerMl).toBeCloseTo((50 * 2) / 23, 6);
  });

  it("conserves total mass: sum of constituents = total mg/mL × batch", () => {
    const sum = f.constituents.reduce((s, c) => s + c.mgTotal, 0);
    expect(sum).toBeCloseTo(50 * 30, 6);
    expect(f.totalCannabinoidMg).toBeCloseTo(1500, 6);
  });

  it("reduces the ratio label by gcd", () => {
    const g = computeFormulation({
      ratio: { CBD: 40, THC: 2, CBN: 4 },
      totalCannabinoidMgPerMl: 50,
      batchVolumeMl: 30,
    });
    expect(g.ratioLabel).toBe("CBD:THC:CBN 20:1:2");
  });

  it("rejects degenerate targets", () => {
    expect(() => computeFormulation({ ratio: {}, totalCannabinoidMgPerMl: 50, batchVolumeMl: 30 })).toThrow();
    expect(() => computeFormulation({ ratio: { CBD: 1 }, totalCannabinoidMgPerMl: 0, batchVolumeMl: 30 })).toThrow();
    expect(() => computeFormulation({ ratio: { CBD: 1 }, totalCannabinoidMgPerMl: 50, batchVolumeMl: 0 })).toThrow();
  });
});

describe("computeYield", () => {
  const f = computeFormulation({
    ratio: { CBD: 20, THC: 1, CBN: 2 },
    totalCannabinoidMgPerMl: 50,
    batchVolumeMl: 30,
  });

  const isolates: RawIngredient[] = [
    { id: "cbd-iso", label: "CBD isolate", potencyMgPerGram: { CBD: 990 } },
    { id: "thc-dist", label: "THC distillate", potencyMgPerGram: { THC: 900 } },
    { id: "cbn-iso", label: "CBN isolate", potencyMgPerGram: { CBN: 980 } },
  ];

  it("computes grams of each isolate from required mg", () => {
    const y = computeYield(f, isolates);
    const cbd = y.ingredients.find((i) => i.id === "cbd-iso")!;
    const thc = y.ingredients.find((i) => i.id === "thc-dist")!;
    // CBD mgTotal = 50 * 20/23 * 30
    expect(cbd.grams).toBeCloseTo(((50 * 20) / 23) * 30 / 990, 5);
    expect(thc.grams).toBeCloseTo(((50 * 1) / 23) * 30 / 900, 5);
    expect(y.unmet).toEqual([]);
    expect(y.warnings).toEqual([]);
  });

  it("sizes carrier as batch minus active volume", () => {
    const y = computeYield(f, isolates);
    const activeMl = y.ingredients.reduce((s, i) => s + i.volumeMl, 0);
    expect(y.carrierVolumeMl).toBeCloseTo(30 - activeMl, 6);
    expect(y.carrierVolumeMl).toBeGreaterThan(0);
    expect(y.totalVolumeMl).toBe(30);
  });

  it("flags a cannabinoid no ingredient can supply", () => {
    const g = computeFormulation({ ratio: { CBD: 1, CBG: 1 }, totalCannabinoidMgPerMl: 20, batchVolumeMl: 10 });
    const y = computeYield(g, [{ id: "cbd-iso", label: "CBD isolate", potencyMgPerGram: { CBD: 990 } }]);
    expect(y.unmet).toEqual(["CBG"]);
    expect(y.warnings.some((w) => w.includes("CBG"))).toBe(true);
  });

  it("warns when an incidental-content ingredient overshoots another constituent", () => {
    const g = computeFormulation({ ratio: { CBD: 1, THC: 1 }, totalCannabinoidMgPerMl: 100, batchVolumeMl: 10 });
    // "dirty" distillate that drags 400 mg/g of CBD along with the THC
    const ings: RawIngredient[] = [
      { id: "cbd-iso", label: "CBD isolate", potencyMgPerGram: { CBD: 990 } },
      { id: "dirty-thc", label: "Crude THC distillate", potencyMgPerGram: { THC: 500, CBD: 400 } },
    ];
    const y = computeYield(g, ings);
    const cbdDelta = y.deltas.find((d) => d.cannabinoid === "CBD")!;
    expect(cbdDelta.achievedMg).toBeGreaterThan(cbdDelta.targetMg);
    expect(cbdDelta.withinTolerance).toBe(false);
    expect(y.warnings.some((w) => w.includes("CBD overshoots"))).toBe(true);
  });

  it("warns when actives cannot fit the batch volume", () => {
    const g = computeFormulation({ ratio: { CBD: 1 }, totalCannabinoidMgPerMl: 200, batchVolumeMl: 5 });
    const weak: RawIngredient[] = [{ id: "weak", label: "Weak pre-mix", potencyMgPerGram: { CBD: 100 } }];
    const y = computeYield(g, weak);
    expect(y.warnings.some((w) => w.includes("exceed"))).toBe(true);
    expect(y.carrierVolumeMl).toBe(0);
  });

  it("honors a pinned source over the most-concentrated default", () => {
    const g = computeFormulation({ ratio: { CBD: 1 }, totalCannabinoidMgPerMl: 20, batchVolumeMl: 10 });
    const ings: RawIngredient[] = [
      { id: "strong", label: "CBD isolate", potencyMgPerGram: { CBD: 990 } },
      { id: "weak", label: "CBD oil", potencyMgPerGram: { CBD: 100 } },
    ];
    const def = computeYield(g, ings);
    expect(def.ingredients[0].id).toBe("strong");
    const pinned = computeYield(g, ings, { sourceByCannabinoid: { CBD: "weak" } });
    expect(pinned.ingredients[0].id).toBe("weak");
  });
});

describe("THC guardrail", () => {
  const f = computeFormulation({
    ratio: { CBD: 20, THC: 1, CBN: 2 },
    totalCannabinoidMgPerMl: 50,
    batchVolumeMl: 30,
  });

  it("computes batch and daily THC mass", () => {
    expect(batchThcMg(f)).toBeCloseTo(((50 * 1) / 23) * 30, 6);
    expect(dailyThcMg(f, { mlPerDose: 1, dosesPerDay: 2 })).toBeCloseTo(((50 * 1) / 23) * 2, 6);
  });

  it("flags a per-batch THC violation", () => {
    const r = checkThcGuardrail(f, { maxThcMgPerBatch: 50, label: "Demo State 2026" });
    expect(r.ok).toBe(false);
    expect(r.violations[0]).toMatch(/per-batch limit \(Demo State 2026\)/);
  });

  it("flags a per-day THC violation only with a dose spec", () => {
    const dose = { mlPerDose: 1, dosesPerDay: 2 };
    expect(checkThcGuardrail(f, { maxThcMgPerDay: 4 }, dose).ok).toBe(false);
    expect(checkThcGuardrail(f, { maxThcMgPerDay: 4 }).ok).toBe(true); // no dose ⇒ daily not evaluated
  });

  it("passes when within limits", () => {
    const r = checkThcGuardrail(f, { maxThcMgPerBatch: 100, maxThcMgPerDay: 10 }, { mlPerDose: 1, dosesPerDay: 2 });
    expect(r.ok).toBe(true);
    expect(r.violations).toEqual([]);
  });
});
