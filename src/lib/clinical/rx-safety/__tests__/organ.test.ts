import { describe, it, expect } from "vitest";
import { ckdEpi2021, egfrBand, childPugh, evaluateOrgan } from "../organ";
import { LOINC } from "../types";
import type { PatientRxProfile } from "../types";

const NOW = new Date("2026-06-12T00:00:00Z");
function daysAgo(d: number): string {
  return new Date(NOW.getTime() - d * 86400000).toISOString();
}

describe("CKD-EPI 2021 published vectors", () => {
  it("female, 55y, Scr 0.8 → ~87", () => {
    expect(ckdEpi2021(0.8, 55, "female")).toBeCloseTo(86.96, 1);
  });
  it("male, 60y, Scr 1.2 → ~69", () => {
    expect(ckdEpi2021(1.2, 60, "male")).toBeCloseTo(69.23, 1);
  });
  it("male, 70y, Scr 2.5 → ~27", () => {
    expect(ckdEpi2021(2.5, 70, "male")).toBeCloseTo(26.96, 1);
  });
  it("female, 65y, Scr 1.8 → ~31", () => {
    expect(ckdEpi2021(1.8, 65, "female")).toBeCloseTo(30.88, 1);
  });
  it("egfrBand maps correctly", () => {
    expect(egfrBand(95)).toBe("G1");
    expect(egfrBand(27)).toBe("G4");
    expect(egfrBand(31)).toBe("G3b");
  });
});

describe("Child-Pugh published vectors", () => {
  it("all-normal labs → class A score 5", () => {
    const r = childPugh({ bilirubin: 1.0, albumin: 4.0, inr: 1.1 });
    expect(r.score).toBe(5);
    expect(r.class).toBe("A");
  });
  it("moderate derangement → class B", () => {
    // bili 2.5 (2pt), alb 3.0 (2pt), inr 2.0 (2pt), ascites slight (2pt),
    // enceph grade 1 (2pt) = 10? → tune to land in B: score 7-9
    const r = childPugh({
      bilirubin: 2.5,
      albumin: 3.0,
      inr: 1.5,
      ascites: "slight",
    });
    // 2 + 2 + 1 + 2 + 1 = 8
    expect(r.score).toBe(8);
    expect(r.class).toBe("B");
  });
  it("severe derangement → class C", () => {
    const r = childPugh({
      bilirubin: 4.0,
      albumin: 2.5,
      inr: 2.5,
      ascites: "moderate",
      encephalopathyGrade: 3,
    });
    // 3 + 3 + 3 + 3 + 3 = 15
    expect(r.score).toBe(15);
    expect(r.class).toBe("C");
  });
});

const baseProfile: Omit<PatientRxProfile, "labs"> = {
  sex: "male",
  age: 70,
  pgxVariants: [],
  activeMeds: [],
  botanicalExposures: [],
};

describe("renal dose adjustment finding", () => {
  it("flags gabapentin at reduced eGFR", () => {
    const profile: PatientRxProfile = {
      ...baseProfile,
      labs: [{ loinc: LOINC.SERUM_CREATININE, value: 2.5, observedAt: daysAgo(10) }],
    };
    const findings = evaluateOrgan({ drugName: "gabapentin" }, profile, NOW);
    expect(findings).toHaveLength(1);
    expect(findings[0].kind).toBe("dosing_override");
    expect(findings[0].details?.egfrBand).toBe("G4");
    expect(findings[0].lowConfidence).toBeFalsy();
  });
  it("no flag at normal eGFR", () => {
    const profile: PatientRxProfile = {
      ...baseProfile,
      age: 40,
      labs: [{ loinc: LOINC.SERUM_CREATININE, value: 0.9, observedAt: daysAgo(5) }],
    };
    expect(evaluateOrgan({ drugName: "gabapentin" }, profile, NOW)).toHaveLength(0);
  });
});

describe("hepatic dose cap finding", () => {
  it("caps acetaminophen in Child-Pugh C and flags dose excess", () => {
    const profile: PatientRxProfile = {
      ...baseProfile,
      ascites: "moderate",
      encephalopathyGrade: 3,
      labs: [
        { loinc: LOINC.TOTAL_BILIRUBIN, value: 4.0, observedAt: daysAgo(10) },
        { loinc: LOINC.ALBUMIN, value: 2.5, observedAt: daysAgo(10) },
        { loinc: LOINC.INR, value: 2.5, observedAt: daysAgo(10) },
      ],
    };
    const findings = evaluateOrgan(
      { drugName: "acetaminophen", dailyDoseMg: 3000 },
      profile,
      NOW
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].details?.childPughClass).toBe("C");
    expect(findings[0].details?.exceedsCap).toBe(true);
  });
});

describe("stale labs → lowConfidence (never silently used)", () => {
  it("marks lowConfidence when creatinine > 180 days old", () => {
    const profile: PatientRxProfile = {
      ...baseProfile,
      labs: [
        { loinc: LOINC.SERUM_CREATININE, value: 2.5, observedAt: daysAgo(200) },
      ],
    };
    const findings = evaluateOrgan({ drugName: "gabapentin" }, profile, NOW);
    expect(findings).toHaveLength(1);
    expect(findings[0].lowConfidence).toBe(true);
  });
});
