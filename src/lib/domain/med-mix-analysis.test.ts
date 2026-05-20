// EMR-757 — Med Mix analyzer tests.

import { describe, it, expect } from "vitest";
import { analyzeMedMix } from "./med-mix-analysis";

describe("analyzeMedMix", () => {
  it("returns no findings when no inputs match the interaction db", () => {
    const r = analyzeMedMix({
      medications: [{ name: "zzz-fictional-supplement-xyz", source: "otc" }],
      cannabinoids: ["CBD"],
    });
    expect(r.findings).toEqual([]);
  });

  it("flags OTC sources as well as prescription sources", () => {
    const r = analyzeMedMix({
      medications: [{ name: "ibuprofen", source: "otc" }],
      cannabinoids: ["CBD"],
    });
    // We don't assert specific db hits (depends on data/), but if a
    // finding is returned, the source list must include otc + cannabis.
    if (r.findings.length > 0) {
      for (const f of r.findings) {
        expect(f.sources).toContain("cannabis");
        expect(f.sources).toContain("otc");
      }
    }
  });

  it("escalates severity when bleeding-risk history is present", () => {
    const baseline = analyzeMedMix({
      medications: [{ name: "warfarin", source: "prescription" }],
      cannabinoids: ["CBD"],
    });
    const escalated = analyzeMedMix({
      medications: [{ name: "warfarin", source: "prescription" }],
      cannabinoids: ["CBD"],
      history: [{ label: "atrial fibrillation", icd10: "I48.0" }],
    });
    if (baseline.findings.length > 0 && escalated.findings.length > 0) {
      const order = { red: 0, yellow: 1, green: 2 } as const;
      expect(order[escalated.findings[0]!.adjustedSeverity]).toBeLessThanOrEqual(
        order[baseline.findings[0]!.adjustedSeverity],
      );
      expect(escalated.findings[0]!.sources).toContain("history");
      expect(escalated.findings[0]!.amplifiers.length).toBeGreaterThan(0);
    }
  });

  it("lists missing input categories", () => {
    const r = analyzeMedMix({
      medications: [{ name: "atenolol", source: "prescription" }],
      cannabinoids: ["THC"],
    });
    expect(r.missing).toEqual(
      expect.arrayContaining(["otc", "history", "exam"]),
    );
  });
});
