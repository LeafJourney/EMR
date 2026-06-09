import { describe, it, expect } from "vitest";
import {
  BASELINE,
  clamp,
  zForConfidence,
  gaussianRatio,
  gaussianY,
  amplitudeForEfficacy,
  peakYForEfficacy,
  sampleCurve,
  buildLinePath,
  buildAreaPath,
  buildBandPath,
  segmentEfficacyDelta,
  computeProfile,
  COHORT_PRESETS,
  REGIMEN_MODS,
} from "./CohortSimulator";

describe("clamp", () => {
  it("bounds a value within [min, max]", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-3, 0, 10)).toBe(0);
    expect(clamp(42, 0, 10)).toBe(10);
  });
});

describe("zForConfidence", () => {
  it("maps confidence levels to two-sided z multipliers", () => {
    expect(zForConfidence("90")).toBeCloseTo(1.645);
    expect(zForConfidence("95")).toBeCloseTo(1.96);
    expect(zForConfidence("99")).toBeCloseTo(2.576);
    expect(zForConfidence(95)).toBeCloseTo(1.96);
  });

  it("defaults unknown levels to 95%", () => {
    expect(zForConfidence("80")).toBeCloseTo(1.96);
  });
});

describe("gaussianRatio", () => {
  it("peaks at 1 at the mean", () => {
    expect(gaussianRatio(200, 200, 60)).toBeCloseTo(1);
  });

  it("is symmetric around the mean", () => {
    expect(gaussianRatio(140, 200, 60)).toBeCloseTo(gaussianRatio(260, 200, 60));
  });

  it("decays monotonically away from the mean", () => {
    const near = gaussianRatio(220, 200, 60);
    const far = gaussianRatio(320, 200, 60);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(1);
  });

  it("never divides by zero when sigma is non-positive", () => {
    expect(Number.isFinite(gaussianRatio(10, 0, 0))).toBe(true);
  });
});

describe("gaussianY", () => {
  it("returns peakY at the mean and approaches baseline in the tails", () => {
    expect(gaussianY(200, 200, 60, 20)).toBeCloseTo(20);
    expect(gaussianY(0, 200, 30, 20)).toBeCloseTo(BASELINE, 0);
  });

  it("stays between peakY and baseline", () => {
    const y = gaussianY(240, 200, 60, 20);
    expect(y).toBeGreaterThan(20);
    expect(y).toBeLessThan(BASELINE);
  });
});

describe("amplitude / peak height", () => {
  it("grows taller (smaller peakY) as efficacy rises", () => {
    expect(amplitudeForEfficacy(90)).toBeGreaterThan(amplitudeForEfficacy(50));
    expect(peakYForEfficacy(90)).toBeLessThan(peakYForEfficacy(50));
  });

  it("clamps the peak inside the viewBox", () => {
    expect(peakYForEfficacy(100)).toBeGreaterThanOrEqual(8);
    expect(peakYForEfficacy(0)).toBeLessThanOrEqual(130);
  });
});

describe("sampleCurve", () => {
  const pts = sampleCurve(200, 60, 20);

  it("spans the full x-range inclusively", () => {
    expect(pts[0].x).toBe(0);
    expect(pts[pts.length - 1].x).toBe(400);
  });

  it("places its lowest y (tallest point) near the mean", () => {
    const peak = pts.reduce((a, b) => (b.y < a.y ? b : a));
    expect(Math.abs(peak.x - 200)).toBeLessThanOrEqual(5);
  });
});

describe("path builders", () => {
  const pts = sampleCurve(200, 60, 20);

  it("buildLinePath starts with a moveto and uses linetos for the rest", () => {
    const d = buildLinePath(pts);
    expect(d.startsWith("M 0")).toBe(true);
    expect((d.match(/L /g) ?? []).length).toBe(pts.length - 1);
  });

  it("buildLinePath is empty for no points", () => {
    expect(buildLinePath([])).toBe("");
  });

  it("buildAreaPath closes the shape down to the baseline", () => {
    const d = buildAreaPath(pts);
    expect(d.trim().endsWith("Z")).toBe(true);
    expect(d).toContain(`L 400 ${BASELINE}`);
    expect(d).toContain(`L 0 ${BASELINE}`);
  });

  it("buildBandPath returns a closed slice for a valid interval", () => {
    const d = buildBandPath(200, 60, 20, 120, 280);
    expect(d.startsWith("M 120")).toBe(true);
    expect(d.trim().endsWith("Z")).toBe(true);
  });

  it("buildBandPath is empty when the interval is degenerate", () => {
    expect(buildBandPath(200, 60, 20, 200, 200)).toBe("");
    expect(buildBandPath(200, 60, 20, 250, 100)).toBe("");
  });
});

describe("segmentEfficacyDelta", () => {
  it("rewards engaged segments and penalises dormant ones", () => {
    expect(segmentEfficacyDelta("active")).toBeGreaterThan(0);
    expect(segmentEfficacyDelta("archived")).toBeLessThan(
      segmentEfficacyDelta("active"),
    );
    expect(segmentEfficacyDelta("unknown")).toBe(0);
    expect(segmentEfficacyDelta(undefined)).toBe(0);
  });
});

describe("COHORT_PRESETS", () => {
  it("has unique ids and includes the high-risk diabetics preset", () => {
    const ids = COHORT_PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("diabetic");
  });

  it("every preset carries the fields the chart and metrics need", () => {
    for (const p of COHORT_PRESETS) {
      expect(typeof p.label).toBe("string");
      expect(p.emoji.length).toBeGreaterThan(0);
      expect(p.mean).toBeGreaterThan(0);
      expect(p.sigma).toBeGreaterThan(0);
      expect(p.baseEfficacy).toBeGreaterThan(0);
      expect(p.dose).toMatch(/mg$/);
      expect(p.blurb.length).toBeGreaterThan(10);
    }
  });
});

describe("REGIMEN_MODS", () => {
  it("defines every regimen the selector offers", () => {
    expect(Object.keys(REGIMEN_MODS).sort()).toEqual(
      ["balanced", "cbd", "micro", "thc"].sort(),
    );
  });
});

describe("computeProfile", () => {
  const base = {
    presetId: "general",
    regimenKey: "balanced",
    confidence: "95",
    segment: "active",
  };

  it("keeps every derived value inside chart/metric bounds", () => {
    const p = computeProfile(base);
    expect(p.mean).toBeGreaterThanOrEqual(60);
    expect(p.mean).toBeLessThanOrEqual(340);
    expect(p.sigma).toBeGreaterThanOrEqual(24);
    expect(p.sigma).toBeLessThanOrEqual(120);
    expect(p.efficacy).toBeGreaterThanOrEqual(5);
    expect(p.efficacy).toBeLessThanOrEqual(97);
    expect(p.adverseRate).toBeGreaterThanOrEqual(0.1);
    expect(p.lower).toBeLessThan(p.mean);
    expect(p.upper).toBeGreaterThan(p.mean);
    expect(p.lower).toBeGreaterThanOrEqual(0);
    expect(p.upper).toBeLessThanOrEqual(400);
  });

  it("models high-risk diabetics as lower-efficacy, higher-risk than the general cohort", () => {
    const general = computeProfile({ ...base, presetId: "general" });
    const diabetic = computeProfile({ ...base, presetId: "diabetic" });
    expect(diabetic.efficacy).toBeLessThan(general.efficacy);
    expect(diabetic.adverseRate).toBeGreaterThan(general.adverseRate);
  });

  it("makes CBD safer than THC for the same cohort", () => {
    const cbd = computeProfile({ ...base, regimenKey: "cbd" });
    const thc = computeProfile({ ...base, regimenKey: "thc" });
    expect(cbd.adverseRate).toBeLessThan(thc.adverseRate);
  });

  it("widens the confidence band as the confidence level rises", () => {
    const ci90 = computeProfile({ ...base, confidence: "90" });
    const ci99 = computeProfile({ ...base, confidence: "99" });
    expect(ci99.upper - ci99.lower).toBeGreaterThan(ci90.upper - ci90.lower);
  });

  it("boosts efficacy for engaged segments over dormant ones", () => {
    const active = computeProfile({ ...base, segment: "active" });
    const archived = computeProfile({ ...base, segment: "archived" });
    expect(active.efficacy).toBeGreaterThan(archived.efficacy);
  });

  it("falls back to safe defaults for unknown preset/regimen", () => {
    const p = computeProfile({
      presetId: "does-not-exist",
      regimenKey: "nope",
      confidence: "95",
      segment: "active",
    });
    expect(p.presetLabel).toBe(COHORT_PRESETS[0].label);
    expect(p.regimenLabel).toBe(REGIMEN_MODS.balanced.label);
  });

  it("prefers the regimen dose when one is defined, else the preset dose", () => {
    const balanced = computeProfile({ ...base, regimenKey: "balanced" });
    const cbd = computeProfile({ ...base, regimenKey: "cbd" });
    expect(balanced.optDose).toBe("12.5mg"); // general preset dose (balanced has none)
    expect(cbd.optDose).toBe("20.0mg"); // cbd regimen overrides
  });
});
