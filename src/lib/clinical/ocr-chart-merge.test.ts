import { describe, expect, it } from "vitest";
import type { ExtractedField } from "./ocr-extract";
import { planMerge, type ChartSnapshot } from "./ocr-chart-merge";

function field(path: string, value: string, confidence = 0.9): ExtractedField {
  return {
    kind: path.startsWith("vital")
      ? "vital"
      : path === "dob" || path === "phone" || path === "externalMrn"
        ? "demographic"
        : path === "medication"
          ? "medication"
          : path === "allergy"
            ? "allergy"
            : path === "problem.icd10"
              ? "problem"
              : "note",
    path,
    source: `${path}: ${value}`,
    value,
    confidence,
  };
}

describe("planMerge", () => {
  it("buckets a fresh chart's fields as 'add'", () => {
    const plan = planMerge(
      [field("dob", "1982-03-14"), field("phone", "(555) 123-4567")],
      {},
    );
    expect(plan.autoApply).toHaveLength(2);
    expect(plan.needsReview).toHaveLength(0);
    expect(plan.duplicates).toHaveLength(0);
  });

  it("flags DOB conflict when the chart has a different DOB", () => {
    const plan = planMerge(
      [field("dob", "1982-03-14")],
      { dob: "1981-12-01" },
    );
    expect(plan.items[0].decision).toBe("conflict");
    expect(plan.items[0].existingValue).toBe("1981-12-01");
  });

  it("flags an identical DOB as duplicate (no action needed)", () => {
    const plan = planMerge(
      [field("dob", "1982-03-14")],
      { dob: "1982-03-14" },
    );
    expect(plan.items[0].decision).toBe("duplicate");
    expect(plan.duplicates).toHaveLength(1);
  });

  it("marks low-confidence fields for review even when chart is empty", () => {
    const plan = planMerge(
      [field("phone", "(555) 999-0000", 0.4)],
      {},
    );
    expect(plan.items[0].decision).toBe("review");
    expect(plan.needsReview).toHaveLength(1);
  });

  it("treats medications as conflicts when name matches but dose differs", () => {
    const plan = planMerge(
      [field("medication", "Lisinopril 20mg")],
      {
        medications: [{ name: "Lisinopril", doseDisplay: "10mg" }],
      } as ChartSnapshot,
    );
    expect(plan.items[0].decision).toBe("conflict");
    expect(plan.items[0].existingValue).toBe("Lisinopril 10mg");
  });

  it("treats medications as duplicate when name + dose match", () => {
    const plan = planMerge(
      [field("medication", "Lisinopril 10mg")],
      {
        medications: [{ name: "Lisinopril", doseDisplay: "10mg" }],
      } as ChartSnapshot,
    );
    expect(plan.items[0].decision).toBe("duplicate");
  });

  it("dedupes allergies (case-insensitive)", () => {
    const plan = planMerge(
      [field("allergy", "Penicillin")],
      { allergies: [{ substance: "penicillin" }] } as ChartSnapshot,
    );
    expect(plan.items[0].decision).toBe("duplicate");
  });

  it("ignores allergies not yet on the chart", () => {
    const plan = planMerge(
      [field("allergy", "Sulfa")],
      { allergies: [{ substance: "Penicillin" }] } as ChartSnapshot,
    );
    expect(plan.items[0].decision).toBe("add");
  });

  it("dedupes ICD-10 problems already on the active list", () => {
    const plan = planMerge(
      [field("problem.icd10", "E11.9")],
      { problems: [{ icd10: "E11.9" }] } as ChartSnapshot,
    );
    expect(plan.items[0].decision).toBe("duplicate");
  });

  it("vitals never conflict — every measurement is a new row", () => {
    const plan = planMerge(
      [field("vital.bp", "124/78")],
      { vitals: { bp: "138/90" } } as ChartSnapshot,
    );
    expect(plan.items[0].decision).toBe("add");
  });

  it("vital duplicate when newest value already matches OCR", () => {
    const plan = planMerge(
      [field("vital.bp", "124/78")],
      { vitals: { bp: "124/78" } } as ChartSnapshot,
    );
    expect(plan.items[0].decision).toBe("duplicate");
  });

  it("payer conflict surfaces existing vs incoming payer", () => {
    const plan = planMerge(
      [field("insurance.payer", "Aetna POS")],
      { insurance: { payer: "Blue Cross" } } as ChartSnapshot,
    );
    expect(plan.items[0].decision).toBe("conflict");
    expect(plan.items[0].existingValue).toBe("Blue Cross");
  });
});
