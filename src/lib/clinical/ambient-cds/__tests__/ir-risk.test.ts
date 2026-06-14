// Wearable-Augmented Insulin Resistance Risk Index — IR_risk (EMR-1127).

import { describe, expect, it } from "vitest";
import {
  computeIrRisk,
  homaIr,
  IR_RISK_WEIGHTS,
  logistic,
} from "../ir-risk";
import {
  IR_RISK_WARN_THRESHOLD,
  type NormalizedTelemetry,
} from "../types";

const NOW = new Date("2026-06-14T12:00:00.000Z");
const DAY = 86_400_000;

/** Telemetry already aligned to the two model scalars. */
function telem(
  cgmVariabilityPct: number | null,
  hrvReductionMs: number | null
): NormalizedTelemetry {
  return { cgmVariabilityPct, hrvReductionMs, cgmDays: 14, hrvDays: 14 };
}

describe("homaIr / logistic", () => {
  it("HOMA-IR = glucose × insulin / 405", () => {
    expect(homaIr(105, 12)).toBeCloseTo(3.1111, 4);
  });
  it("logistic is centered at 0.5", () => {
    expect(logistic(0)).toBe(0.5);
  });
});

describe("computeIrRisk — guards", () => {
  it("returns null without the fasting glucose + insulin anchor", () => {
    expect(computeIrRisk({ biomarkers: {} }, NOW)).toBeNull();
    expect(
      computeIrRisk({ biomarkers: { fastingGlucoseMgDl: 90 } }, NOW)
    ).toBeNull();
    expect(
      computeIrRisk(
        { biomarkers: { fastingGlucoseMgDl: 0, fastingInsulinUIuMl: 5 } },
        NOW
      )
    ).toBeNull();
  });
});

describe("computeIrRisk — calibration anchors", () => {
  it("healthy fasting panel scores optimal", () => {
    const r = computeIrRisk(
      {
        biomarkers: {
          fastingGlucoseMgDl: 85,
          fastingInsulinUIuMl: 4,
          hba1cPct: 5.2,
        },
      },
      NOW
    )!;
    expect(r.homaIr).toBeCloseTo(0.8395, 4);
    expect(r.score).toBeLessThan(0.1);
    expect(r.band).toBe("optimal");
    expect(r.warn).toBe(false);
    expect(r.wearableAugmented).toBe(false);
  });

  it("borderline labs alone stay under the 0.65 warning line", () => {
    const r = computeIrRisk(
      {
        biomarkers: {
          fastingGlucoseMgDl: 105,
          fastingInsulinUIuMl: 12,
          hba1cPct: 5.9,
        },
      },
      NOW
    )!;
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.score).toBeLessThan(IR_RISK_WARN_THRESHOLD);
    expect(r.band).toBe("moderate");
    expect(r.warn).toBe(false);
  });

  it("wearable telemetry tips the SAME borderline patient over 0.65", () => {
    const biomarkers = {
      fastingGlucoseMgDl: 105,
      fastingInsulinUIuMl: 12,
      hba1cPct: 5.9,
    };
    const labsOnly = computeIrRisk({ biomarkers }, NOW)!;
    const augmented = computeIrRisk(
      { biomarkers, normalizedTelemetry: telem(28, 18) },
      NOW
    )!;

    expect(labsOnly.warn).toBe(false);
    expect(augmented.score).toBeGreaterThan(labsOnly.score);
    expect(augmented.warn).toBe(true);
    expect(augmented.band).toBe("high");
    expect(augmented.wearableAugmented).toBe(true);
  });

  it("severe metabolic state saturates near 1.0", () => {
    const r = computeIrRisk(
      {
        biomarkers: {
          fastingGlucoseMgDl: 140,
          fastingInsulinUIuMl: 25,
          hba1cPct: 7.5,
        },
        normalizedTelemetry: telem(40, 45),
      },
      NOW
    )!;
    expect(r.score).toBeGreaterThan(0.99);
    expect(r.band).toBe("severe");
    expect(r.warn).toBe(true);
  });
});

describe("computeIrRisk — breakdown + flags", () => {
  it("ranks factor contributions descending, HOMA-IR leading when dominant", () => {
    const r = computeIrRisk(
      {
        biomarkers: {
          fastingGlucoseMgDl: 140,
          fastingInsulinUIuMl: 25,
          hba1cPct: 7.5,
        },
        normalizedTelemetry: telem(40, 45),
      },
      NOW
    )!;
    expect(r.factors[0].factor).toBe("homaIr");
    for (let i = 1; i < r.factors.length; i++) {
      expect(r.factors[i - 1].contribution).toBeGreaterThanOrEqual(
        r.factors[i].contribution
      );
    }
    // intercept echoed for transparency
    expect(r.intercept).toBe(IR_RISK_WEIGHTS.intercept);
  });

  it("omits the HbA1c factor entirely when not supplied", () => {
    const r = computeIrRisk(
      { biomarkers: { fastingGlucoseMgDl: 100, fastingInsulinUIuMl: 5 } },
      NOW
    )!;
    expect(r.factors.some((f) => f.factor === "hba1c")).toBe(false);
  });

  it("counts a present-but-normal CGM as considered, not augmenting", () => {
    const r = computeIrRisk(
      {
        biomarkers: { fastingGlucoseMgDl: 100, fastingInsulinUIuMl: 5 },
        normalizedTelemetry: telem(12, null), // CV below the floor → 0
      },
      NOW
    )!;
    const cgm = r.factors.find((f) => f.factor === "cgmVariability");
    expect(cgm?.contribution).toBe(0);
    expect(r.wearableAugmented).toBe(false);
  });

  it("flags stale fasting panels as low confidence without dropping them", () => {
    const stale = computeIrRisk(
      {
        biomarkers: {
          fastingGlucoseMgDl: 100,
          fastingInsulinUIuMl: 5,
          drawnAt: new Date(NOW.getTime() - 200 * DAY),
        },
      },
      NOW
    )!;
    expect(stale.lowConfidence).toBe(true);

    const fresh = computeIrRisk(
      {
        biomarkers: {
          fastingGlucoseMgDl: 100,
          fastingInsulinUIuMl: 5,
          drawnAt: new Date(NOW.getTime() - 10 * DAY),
        },
      },
      NOW
    )!;
    expect(fresh.lowConfidence).toBe(false);
  });

  it("prefers explicit normalizedTelemetry over raw points", () => {
    const r = computeIrRisk(
      {
        biomarkers: { fastingGlucoseMgDl: 100, fastingInsulinUIuMl: 5 },
        telemetry: { cgm: [{ at: NOW, value: 100 }] }, // would yield null CV
        normalizedTelemetry: telem(50, null),
      },
      NOW
    )!;
    const cgm = r.factors.find((f) => f.factor === "cgmVariability");
    expect(cgm).toBeDefined();
    expect(cgm!.contribution).toBeGreaterThan(0);
  });
});
