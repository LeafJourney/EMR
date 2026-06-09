import { describe, expect, it } from "vitest";
import { LAB_PANELS, labByKey, isAbnormal } from "./lab-directory";

// EMR-871 — orderable lab panel directory

describe("LAB_PANELS directory", () => {
  it("is non-empty and includes the panels Dr. Patel named", () => {
    expect(LAB_PANELS.length).toBeGreaterThanOrEqual(13);
    const keys = LAB_PANELS.map((p) => p.key);
    for (const k of ["cbc", "cmp", "lipid", "psa", "thyroid", "vitamin-d", "uric-acid", "urine", "a1c", "ferritin", "crp", "hscrp"]) {
      expect(keys).toContain(k);
    }
  });

  it("has unique keys, an emoji, and at least one component per panel", () => {
    const seen = new Set<string>();
    for (const p of LAB_PANELS) {
      expect(seen.has(p.key)).toBe(false);
      seen.add(p.key);
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(p.components.length).toBeGreaterThan(0);
      for (const c of p.components) {
        expect(c.name.length).toBeGreaterThan(0);
        if (c.refLow !== undefined && c.refHigh !== undefined) {
          expect(c.refLow).toBeLessThanOrEqual(c.refHigh);
        }
      }
    }
  });

  it("includes GGT in the CMP and ApoB + Lp(a) in the Lipid panel", () => {
    const cmp = labByKey("cmp")!;
    expect(cmp.components.map((c) => c.name)).toContain("GGT");
    const lipid = labByKey("lipid")!;
    const names = lipid.components.map((c) => c.name);
    expect(names).toContain("ApoB");
    expect(names).toContain("Lp(a)");
  });
});

describe("labByKey", () => {
  it("resolves a known key case-insensitively and returns undefined otherwise", () => {
    expect(labByKey("CBC")?.fullName).toMatch(/Complete Blood Count/);
    expect(labByKey("nope")).toBeUndefined();
  });
});

describe("isAbnormal", () => {
  it("flags values below refLow and above refHigh, accepts in-range", () => {
    const tsh = { name: "TSH", unit: "mIU/L", refLow: 0.4, refHigh: 4.0 };
    expect(isAbnormal(tsh, 0.1)).toBe(true);
    expect(isAbnormal(tsh, 8)).toBe(true);
    expect(isAbnormal(tsh, 2.0)).toBe(false);
  });

  it("never flags a component with no bounds", () => {
    expect(isAbnormal({ name: "Note", unit: "" }, 9999)).toBe(false);
  });
});
