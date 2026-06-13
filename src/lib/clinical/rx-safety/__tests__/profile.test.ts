import { describe, it, expect } from "vitest";
import {
  ageFromDateOfBirth,
  botanicalExposuresFromRows,
  buildPatientRxProfile,
  labsFromLabResults,
  markerToLoinc,
  sexFromIntake,
  taggedProductName,
  CONCENTRATED_CBD_THRESHOLD,
  type RegimenProductInput,
} from "../profile";
import { evaluateRxSafety } from "../evaluate";
import { LOINC } from "../types";

const NOW = new Date("2026-06-12T00:00:00Z");
function daysAgo(d: number): Date {
  return new Date(NOW.getTime() - d * 86400000);
}

function product(over: Partial<RegimenProductInput> = {}): RegimenProductInput {
  return {
    name: "Relief Tincture",
    thcConcentration: null,
    cbdConcentration: null,
    cbnConcentration: null,
    cbgConcentration: null,
    ...over,
  };
}

/* ── markerToLoinc ───────────────────────────────────────────────────── */

describe("markerToLoinc", () => {
  it("maps creatinine aliases", () => {
    for (const m of ["Cr", "Creatinine", "Serum Creatinine", "SCr", "creat"]) {
      expect(markerToLoinc(m)).toBe(LOINC.SERUM_CREATININE);
    }
  });

  it("maps bilirubin / albumin / INR aliases", () => {
    expect(markerToLoinc("Total Bilirubin")).toBe(LOINC.TOTAL_BILIRUBIN);
    expect(markerToLoinc("TBili")).toBe(LOINC.TOTAL_BILIRUBIN);
    expect(markerToLoinc("bilirubin, total")).toBe(LOINC.TOTAL_BILIRUBIN);
    expect(markerToLoinc("Albumin")).toBe(LOINC.ALBUMIN);
    expect(markerToLoinc("ALB")).toBe(LOINC.ALBUMIN);
    expect(markerToLoinc("INR")).toBe(LOINC.INR);
    expect(markerToLoinc("PT/INR")).toBe(LOINC.INR);
  });

  it("never matches lookalike markers (exact-token, not substring)", () => {
    expect(markerToLoinc("eGFR")).toBeNull();
    expect(markerToLoinc("CrCl")).toBeNull();
    expect(markerToLoinc("Microalbumin")).toBeNull();
    expect(markerToLoinc("Urine albumin/creatinine")).toBeNull();
    expect(markerToLoinc("")).toBeNull();
  });
});

/* ── labsFromLabResults ──────────────────────────────────────────────── */

describe("labsFromLabResults", () => {
  it("extracts LOINC-coded labs with observation dates from panel JSON", () => {
    const labs = labsFromLabResults([
      {
        receivedAt: daysAgo(10),
        results: {
          Cr: { value: 1.4, unit: "mg/dL", refLow: 0.6, refHigh: 1.2 },
          eGFR: { value: 52, unit: "mL/min" }, // not a guardrail marker
          Na: { value: 140, unit: "mEq/L" },
        },
      },
      {
        receivedAt: daysAgo(200),
        results: {
          "Total Bilirubin": { value: 2.4, unit: "mg/dL" },
          Albumin: { value: 2.6, unit: "g/dL" },
          INR: { value: 1.9 },
        },
      },
    ]);

    expect(labs).toHaveLength(4);
    const cr = labs.find((l) => l.loinc === LOINC.SERUM_CREATININE)!;
    expect(cr.value).toBe(1.4);
    expect(cr.unit).toBe("mg/dL");
    expect(new Date(cr.observedAt).toISOString()).toBe(
      daysAgo(10).toISOString()
    );
    const inr = labs.find((l) => l.loinc === LOINC.INR)!;
    expect(inr.value).toBe(1.9);
    expect(inr.unit).toBeUndefined();
    expect(new Date(inr.observedAt).toISOString()).toBe(
      daysAgo(200).toISOString()
    );
  });

  it("keeps every dated occurrence so the engine can pick the freshest", () => {
    const labs = labsFromLabResults([
      { receivedAt: daysAgo(1), results: { Cr: { value: 1.1 } } },
      { receivedAt: daysAgo(180), results: { Cr: { value: 1.0 } } },
    ]);
    expect(labs.map((l) => l.value).sort()).toEqual([1.0, 1.1]);
  });

  it("ignores malformed rows and non-numeric values", () => {
    const labs = labsFromLabResults([
      { receivedAt: daysAgo(1), results: null },
      { receivedAt: daysAgo(1), results: "corrupt" },
      {
        receivedAt: daysAgo(1),
        results: {
          Cr: { value: "1.2" }, // string value → skipped
          INR: { value: Number.NaN }, // non-finite → skipped
          Albumin: null,
        },
      },
    ]);
    expect(labs).toHaveLength(0);
  });
});

/* ── botanical exposures ─────────────────────────────────────────────── */

describe("botanicalExposuresFromRows", () => {
  it("maps cannabis + supplement medications, skips Rx/OTC and inactive rows", () => {
    const exposures = botanicalExposuresFromRows({
      medications: [
        { name: "St. John's Wort", type: "supplement", active: true },
        { name: "CBD oil 1000mg", type: "cannabis", active: true },
        { name: "Warfarin", type: "prescription", active: true },
        { name: "Melatonin", type: "supplement", active: false },
      ],
      dosingRegimens: [],
      doseLogs: [],
    });

    expect(exposures).toHaveLength(2);
    const sjw = exposures.find((e) => e.name === "St. John's Wort")!;
    expect(sjw.kind).toBe("supplement");
    expect(sjw.source).toBe("medication_list");
    const cbd = exposures.find((e) => e.name === "CBD oil 1000mg")!;
    expect(cbd.kind).toBe("cannabinoid");
  });

  it("tags product names with their structured cannabinoid content", () => {
    expect(
      taggedProductName(product({ thcConcentration: 5, cbnConcentration: 1 }))
    ).toBe("Relief Tincture [THC, CBN]");
    expect(taggedProductName(product())).toBe("Relief Tincture");
  });

  it("derives exposures from active regimens and recent dose logs", () => {
    const exposures = botanicalExposuresFromRows({
      medications: [],
      dosingRegimens: [
        { active: true, product: product({ thcConcentration: 10 }) },
        { active: false, product: product({ name: "Old Vape", thcConcentration: 80 }) },
      ],
      doseLogs: [
        {
          estimatedThcMg: null,
          estimatedCbdMg: null,
          regimen: {
            product: product({
              name: "Isolate Drops",
              cbdConcentration: CONCENTRATED_CBD_THRESHOLD,
            }),
          },
        },
      ],
    });

    expect(exposures.map((e) => e.name)).toEqual([
      "Relief Tincture [THC]",
      "Isolate Drops [CBD]",
    ]);
    const regimenExposure = exposures[0];
    expect(regimenExposure.source).toBe("product_log");
    expect(regimenExposure.concentrated).toBeUndefined();
    const logExposure = exposures[1];
    expect(logExposure.source).toBe("dosing_log");
    expect(logExposure.concentrated).toBe(true);
    expect(logExposure.kind).toBe("cannabinoid");
  });

  it("falls back to estimated mg fields for ad-hoc logs without a regimen", () => {
    const exposures = botanicalExposuresFromRows({
      medications: [],
      dosingRegimens: [],
      doseLogs: [
        { estimatedThcMg: 2.5, estimatedCbdMg: 0, regimen: null },
        { estimatedThcMg: null, estimatedCbdMg: null, regimen: null }, // nothing known
      ],
    });
    expect(exposures).toHaveLength(1);
    expect(exposures[0].name).toBe("Patient dose log [THC]");
    expect(exposures[0].source).toBe("dosing_log");
  });

  it("dedupes by name and preserves a concentrated flag from any source", () => {
    const concentrated = product({
      name: "Isolate Drops",
      cbdConcentration: 100,
    });
    const exposures = botanicalExposuresFromRows({
      medications: [],
      dosingRegimens: [
        { active: true, product: product({ name: "Isolate Drops", cbdConcentration: 10 }) },
      ],
      doseLogs: [
        { estimatedThcMg: null, estimatedCbdMg: null, regimen: { product: concentrated } },
        { estimatedThcMg: null, estimatedCbdMg: null, regimen: { product: concentrated } },
      ],
    });
    expect(exposures).toHaveLength(1);
    expect(exposures[0].concentrated).toBe(true);
  });
});

/* ── demographics ────────────────────────────────────────────────────── */

describe("sexFromIntake", () => {
  it("reads sex/gender from the intake blob", () => {
    expect(sexFromIntake({ sex: "Male" })).toBe("male");
    expect(sexFromIntake({ gender: "F" })).toBe("female");
  });

  it("reads sex from the demographics detail editor sections", () => {
    expect(
      sexFromIntake({
        demographicsDetail: {
          identity: { fields: { pronouns: "he/him", sex: "male" } },
        },
      })
    ).toBe("male");
  });

  it("defaults to female (lower CKD-EPI eGFR → conservative) when unknown", () => {
    expect(sexFromIntake(null)).toBe("female");
    expect(sexFromIntake({})).toBe("female");
    expect(sexFromIntake({ sex: "non-binary" })).toBe("female");
    expect(sexFromIntake("corrupt")).toBe("female");
  });
});

describe("ageFromDateOfBirth", () => {
  it("computes whole years, honoring the birthday boundary", () => {
    expect(ageFromDateOfBirth(new Date("1976-06-12"), NOW)).toBe(50);
    expect(ageFromDateOfBirth(new Date("1976-06-13"), NOW)).toBe(49);
  });

  it("returns 0 for unknown or invalid DOB", () => {
    expect(ageFromDateOfBirth(null, NOW)).toBe(0);
    expect(ageFromDateOfBirth("not-a-date", NOW)).toBe(0);
  });
});

/* ── buildPatientRxProfile end-to-end (mocked rows) ──────────────────── */

describe("buildPatientRxProfile", () => {
  const rows = {
    patient: {
      dateOfBirth: new Date("1956-01-15"),
      intakeAnswers: { sex: "male" },
    },
    labResults: [
      {
        receivedAt: daysAgo(14),
        results: { Cr: { value: 2.1, unit: "mg/dL" } },
      },
    ],
    medications: [
      { name: "Warfarin", type: "prescription", active: true },
      { name: "St. John's Wort", type: "supplement", active: true },
      { name: "Lisinopril", type: "prescription", active: false },
    ],
    dosingRegimens: [
      {
        active: true,
        product: product({
          name: "Isolate Drops",
          cbdConcentration: 100,
        }),
      },
    ],
    doseLogs: [],
  };

  it("assembles the full profile from row shapes", () => {
    const profile = buildPatientRxProfile(rows, NOW);

    expect(profile.sex).toBe("male");
    expect(profile.age).toBe(70);
    expect(profile.pgxVariants).toEqual([]); // no PGx storage in schema yet
    expect(profile.activeMeds).toEqual(["Warfarin", "St. John's Wort"]);
    expect(profile.labs).toEqual([
      {
        loinc: LOINC.SERUM_CREATININE,
        value: 2.1,
        unit: "mg/dL",
        observedAt: daysAgo(14).toISOString(),
      },
    ]);
    expect(profile.botanicalExposures).toEqual([
      {
        name: "St. John's Wort",
        kind: "supplement",
        source: "medication_list",
      },
      {
        name: "Isolate Drops [CBD]",
        kind: "cannabinoid",
        concentrated: true,
        source: "product_log",
      },
    ]);
  });

  it("assembled profile drives the engine: CBD exposure × warfarin fires the anticoagulant optimization", async () => {
    const profile = buildPatientRxProfile(rows, NOW);
    const r = await evaluateRxSafety(
      { drugName: "Warfarin 5mg", dose: "5 mg", frequency: "1x per day" },
      profile,
      NOW
    );
    const finding = r.findings.find(
      (f) => f.ruleId === "botanical.cbd.anticoagulant"
    );
    expect(finding).toBeDefined();
    expect(finding!.requiredFollowUp).toEqual([
      { labLoinc: LOINC.INR, timing: "immediate" },
    ]);
  });

  it("assembled labs drive the organ layer: reduced eGFR flags metformin", async () => {
    const profile = buildPatientRxProfile(rows, NOW);
    const r = await evaluateRxSafety(
      { drugName: "Metformin 500mg", dailyDoseMg: 1000 },
      profile,
      NOW
    );
    const finding = r.findings.find(
      (f) => f.ruleId === "organ.renal.dose_adjust"
    );
    expect(finding).toBeDefined();
    expect(finding!.lowConfidence).toBeUndefined(); // labs are 14 days old
  });
});
