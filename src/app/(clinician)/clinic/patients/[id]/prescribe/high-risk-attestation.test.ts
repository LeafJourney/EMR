import { describe, expect, it } from "vitest";
import {
  ageFromDob,
  assessHighRiskAttestation,
  psychiatricComorbidityLabels,
  HIGH_DOSE_THC_MG_PER_DAY,
  ELDERLY_AGE_THRESHOLD,
} from "./high-risk-attestation";

/**
 * WS-C task 3 — the high-risk attestation gate. A clinician acknowledgment is
 * owed for high-dose THC, older adults, and documented psychiatric comorbidity
 * even when the product is not DEA-controlled.
 */
describe("assessHighRiskAttestation", () => {
  it("returns no reasons for a low-dose, young, comorbidity-free Rx", () => {
    const reasons = assessHighRiskAttestation({
      thcMgPerDay: 10,
      patientAge: 40,
      psychiatricComorbidities: [],
    });
    expect(reasons).toEqual([]);
  });

  it("flags high-dose THC at or above the threshold", () => {
    const reasons = assessHighRiskAttestation({
      thcMgPerDay: HIGH_DOSE_THC_MG_PER_DAY,
      patientAge: 30,
      psychiatricComorbidities: [],
    });
    expect(reasons.map((r) => r.kind)).toEqual(["high_dose_thc"]);
  });

  it("does not flag high-dose THC just below the threshold", () => {
    const reasons = assessHighRiskAttestation({
      thcMgPerDay: HIGH_DOSE_THC_MG_PER_DAY - 0.1,
      patientAge: 30,
      psychiatricComorbidities: [],
    });
    expect(reasons).toEqual([]);
  });

  it("treats unknown THC mg/day (custom products) as not high-dose", () => {
    const reasons = assessHighRiskAttestation({
      thcMgPerDay: null,
      patientAge: 30,
      psychiatricComorbidities: [],
    });
    expect(reasons).toEqual([]);
  });

  it("flags older adults at or above the age threshold", () => {
    const reasons = assessHighRiskAttestation({
      thcMgPerDay: 5,
      patientAge: ELDERLY_AGE_THRESHOLD,
      psychiatricComorbidities: [],
    });
    expect(reasons.map((r) => r.kind)).toEqual(["elderly"]);
  });

  it("flags a documented psychiatric comorbidity", () => {
    const reasons = assessHighRiskAttestation({
      thcMgPerDay: 5,
      patientAge: 30,
      psychiatricComorbidities: ["Bipolar I disorder (history of mania)"],
    });
    expect(reasons.map((r) => r.kind)).toEqual(["psychiatric_comorbidity"]);
    expect(reasons[0].detail).toContain("Bipolar I");
  });

  it("can flag multiple reasons at once", () => {
    const reasons = assessHighRiskAttestation({
      thcMgPerDay: 80,
      patientAge: 72,
      psychiatricComorbidities: ["Schizophrenia / psychotic disorder"],
    });
    expect(reasons.map((r) => r.kind).sort()).toEqual(
      ["elderly", "high_dose_thc", "psychiatric_comorbidity"].sort(),
    );
  });
});

describe("psychiatricComorbidityLabels", () => {
  it("keeps only psychiatric contraindication ids, de-duplicated", () => {
    const labels = psychiatricComorbidityLabels([
      { id: "schizophrenia", label: "Schizophrenia / psychotic disorder" },
      { id: "pregnancy", label: "Pregnancy" },
      { id: "severe_mental_health_history", label: "Severe anxiety / panic disorder" },
      { id: "schizophrenia", label: "Schizophrenia / psychotic disorder" },
    ]);
    expect(labels).toEqual([
      "Schizophrenia / psychotic disorder",
      "Severe anxiety / panic disorder",
    ]);
  });

  it("returns empty when no psychiatric match", () => {
    expect(
      psychiatricComorbidityLabels([{ id: "pregnancy", label: "Pregnancy" }]),
    ).toEqual([]);
  });
});

describe("ageFromDob", () => {
  it("computes whole-year age against a fixed now", () => {
    const now = new Date("2026-06-09T00:00:00Z");
    expect(ageFromDob(new Date("1960-01-01T00:00:00Z"), now)).toBe(66);
  });

  it("returns null for missing or unparseable DOB", () => {
    expect(ageFromDob(null)).toBeNull();
    expect(ageFromDob(undefined)).toBeNull();
    expect(ageFromDob("not-a-date")).toBeNull();
  });
});
