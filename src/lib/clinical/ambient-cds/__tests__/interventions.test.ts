// Philosophy-aligned IR interventions (EMR-1129 partial).

import { describe, expect, it } from "vitest";
import { computeIrRisk } from "../ir-risk";
import { recommendIrInterventions } from "../interventions";
import {
  type IrRiskResult,
  type NormalizedTelemetry,
} from "../types";

const NOW = new Date("2026-06-14T12:00:00.000Z");

function score(
  glucose: number,
  insulin: number,
  hba1c: number | undefined,
  telem?: NormalizedTelemetry,
  drawnAt?: Date
): IrRiskResult {
  return computeIrRisk(
    {
      biomarkers: {
        fastingGlucoseMgDl: glucose,
        fastingInsulinUIuMl: insulin,
        hba1cPct: hba1c,
        drawnAt,
      },
      normalizedTelemetry: telem,
    },
    NOW
  )!;
}

const tel = (cv: number | null, hrv: number | null): NormalizedTelemetry => ({
  cgmVariabilityPct: cv,
  hrvReductionMs: hrv,
  cgmDays: 14,
  hrvDays: 14,
});

describe("recommendIrInterventions", () => {
  it("suggests nothing for an optimal score", () => {
    const r = score(85, 4, 5.2);
    expect(r.band).toBe("optimal");
    expect(recommendIrInterventions(r)).toEqual([]);
  });

  it("leads with lifestyle/diet for a moderate score", () => {
    const r = score(105, 12, 5.9);
    const recs = recommendIrInterventions(r);
    expect(recs.length).toBeGreaterThan(0);
    // First substantive suggestion is non-pharmacological.
    expect(["diet", "lifestyle"]).toContain(recs[0].category);
    expect(recs.some((i) => i.category === "pharmacological")).toBe(false);
    // Every recommendation carries a stable selection id.
    expect(recs.every((i) => typeof i.id === "string" && i.id.length > 0)).toBe(
      true
    );
  });

  it("attaches a draftable HOMA-IR recheck order to the 12-week follow-up", () => {
    const recs = recommendIrInterventions(score(105, 12, 5.9));
    const recheck = recs.find((i) => i.id === "recheck-12w");
    expect(recheck?.labOrder).toBeDefined();
    expect(recheck!.labOrder!.fasting).toBe(true);
    expect(recheck!.labOrder!.diagnosisCodes).toContain("E88.810");
  });

  it("adds a CGM review only when glycemic variability is a live driver", () => {
    const withCgm = recommendIrInterventions(score(105, 12, 5.9, tel(30, null)));
    const withoutCgm = recommendIrInterventions(score(105, 12, 5.9));
    expect(withCgm.some((i) => /continuous glucose/i.test(i.title))).toBe(true);
    expect(withoutCgm.some((i) => /continuous glucose/i.test(i.title))).toBe(
      false
    );
  });

  it("offers a pharmacologic discussion ONLY at severe — and always last", () => {
    const severe = score(140, 25, 7.5, tel(40, 45));
    expect(severe.band).toBe("severe");
    const recs = recommendIrInterventions(severe);
    const pharma = recs.filter((i) => i.category === "pharmacological");
    expect(pharma).toHaveLength(1);
    expect(recs[recs.length - 1].category).toBe("pharmacological");
  });

  it("puts a confirm-first re-draw at the top when the panel is stale", () => {
    const stale = score(
      105,
      12,
      5.9,
      undefined,
      new Date(NOW.getTime() - 200 * 86_400_000)
    );
    expect(stale.lowConfidence).toBe(true);
    const recs = recommendIrInterventions(stale);
    expect(recs[0].title).toMatch(/re-draw/i);
    // The re-draw-now order replaces the 12-week recheck (no double order).
    expect(recs[0].labOrder).toBeDefined();
    expect(recs.some((i) => i.id === "recheck-12w")).toBe(false);
  });
});
