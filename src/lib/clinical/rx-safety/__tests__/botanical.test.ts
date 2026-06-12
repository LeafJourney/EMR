import { describe, it, expect } from "vitest";
import { evaluateBotanical, cannabinoidsFromExposures } from "../botanical";
import { LOINC } from "../types";
import type { BotanicalExposure } from "../types";

const cbd: BotanicalExposure[] = [
  { name: "CBD isolate", kind: "cannabinoid", concentrated: true },
];

describe("cannabinoidsFromExposures", () => {
  it("detects CBD from a concentrated exposure", () => {
    const { cannabinoids, concentrated } = cannabinoidsFromExposures(cbd);
    expect(cannabinoids).toContain("CBD");
    expect(concentrated).toBe(true);
  });
  it("infers THC+CBD from a ratio product name in the dosing log", () => {
    const { cannabinoids } = cannabinoidsFromExposures([
      { name: "1:1 Relief Tincture", source: "dosing_log" },
    ]);
    expect(cannabinoids).toEqual(expect.arrayContaining(["THC", "CBD"]));
  });
  it("ignores non-cannabis exposures", () => {
    const { cannabinoids } = cannabinoidsFromExposures([
      { name: "St. John's Wort", kind: "herbal" },
    ]);
    expect(cannabinoids).toHaveLength(0);
  });
});

describe("botanical anchor: concentrated CBD × warfarin", () => {
  it("optimization with 25% reduction + immediate INR follow-up", () => {
    const findings = evaluateBotanical({ drugName: "warfarin" }, cbd);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("optimization");
    expect(findings[0].details?.suggestedDoseReductionPct).toBe(25);
    expect(findings[0].requiredFollowUp).toEqual([
      { labLoinc: LOINC.INR, timing: "immediate" },
    ]);
  });
  it("also fires for a DOAC (apixaban)", () => {
    const findings = evaluateBotanical({ drugName: "apixaban" }, cbd);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("optimization");
  });
});

describe("botanical anchor: THC/CBD × clobazam", () => {
  it("dosing_override with high-priority sedation warning", () => {
    const findings = evaluateBotanical({ drugName: "clobazam" }, cbd);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("dosing_override");
    expect(findings[0].details?.sedationRisk).toBe("high");
    expect(findings[0].mechanism).toMatch(/N-desmethylclobazam/);
  });
});

describe("botanical anchor: St. John's Wort × cyclosporine/tacrolimus", () => {
  it("hard_stop for transplant rejection risk", () => {
    const findings = evaluateBotanical({ drugName: "tacrolimus" }, [
      { name: "St. John's Wort", kind: "herbal" },
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("hard_stop");
    expect(findings[0].details?.transplantRejectionRisk).toBe(true);
  });
  it("no SJW exposure → no finding", () => {
    const findings = evaluateBotanical({ drugName: "tacrolimus" }, []);
    expect(findings).toHaveLength(0);
  });
});
