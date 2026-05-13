import { describe, expect, it } from "vitest";
import { extractFromOcr, toChartPatch } from "./ocr-extract";

const SAMPLE_INTAKE = `
PATIENT INTAKE FORM
Name: Jane Doe
DOB: 03/14/1982
Phone: (555) 123-4567
MRN: ABC-12345

VITALS
BP: 124/78
HR: 72
Temp: 98.6
Wt: 165 lbs
Ht: 5'7

ALLERGIES: Penicillin, Sulfa, latex

MEDICATIONS
- Lisinopril 10 mg daily
- Metformin 500mg twice daily
- Atorvastatin 20 mg nightly

PROBLEMS
E11.9
I10
J45.40

Insurance: Aetna POS plan
`;

describe("extractFromOcr", () => {
  it("pulls DOB, MRN, and phone from intake form", () => {
    const r = extractFromOcr({ text: SAMPLE_INTAKE });
    const dob = r.fields.find((f) => f.path === "dob");
    expect(dob?.value).toBe("1982-03-14");
    const mrn = r.fields.find((f) => f.path === "externalMrn");
    expect(mrn?.value).toBe("ABC-12345");
    const phone = r.fields.find((f) => f.path === "phone");
    expect(phone?.value).toBe("(555) 123-4567");
  });

  it("pulls vitals (BP, HR, weight in lbs, height in inches)", () => {
    const r = extractFromOcr({ text: SAMPLE_INTAKE });
    expect(r.fields.find((f) => f.path === "vital.bp")?.value).toBe("124/78");
    expect(r.fields.find((f) => f.path === "vital.hr")?.value).toBe("72");
    expect(r.fields.find((f) => f.path === "vital.weight_lbs")?.value).toBe(
      "165",
    );
    expect(r.fields.find((f) => f.path === "vital.height_in")?.value).toBe(
      "67",
    );
  });

  it("converts kg weight to lbs", () => {
    const r = extractFromOcr({ text: "Wt: 75 kg" });
    const weight = r.fields.find((f) => f.path === "vital.weight_lbs");
    expect(weight).toBeDefined();
    expect(parseFloat(weight!.value)).toBeCloseTo(165.3, 1);
  });

  it("splits allergies on comma / semicolon / 'and'", () => {
    const r = extractFromOcr({
      text: "Allergies: Penicillin, Sulfa and latex",
    });
    const allergens = r.fields
      .filter((f) => f.kind === "allergy")
      .map((f) => f.value);
    expect(allergens).toEqual(
      expect.arrayContaining(["Penicillin", "Sulfa", "latex"]),
    );
  });

  it("records NKDA when allergies line says no known", () => {
    const r = extractFromOcr({ text: "Allergies: NKDA" });
    const allergen = r.fields.find((f) => f.kind === "allergy");
    expect(allergen?.value).toBe("NKDA");
  });

  it("extracts medication name + dose with unit", () => {
    const r = extractFromOcr({ text: "Lisinopril 10 mg daily" });
    const med = r.fields.find((f) => f.kind === "medication");
    expect(med?.value).toBe("Lisinopril 10mg");
  });

  it("deduplicates repeated ICD-10 codes", () => {
    const r = extractFromOcr({ text: "E11.9 E11.9 I10" });
    const icds = r.fields
      .filter((f) => f.path === "problem.icd10")
      .map((f) => f.value);
    expect(icds.sort()).toEqual(["E11.9", "I10"]);
  });

  it("captures insurance line", () => {
    const r = extractFromOcr({ text: "Insurance: Blue Cross Blue Shield" });
    const ins = r.fields.find((f) => f.path === "insurance.payer");
    expect(ins?.value).toContain("Blue Cross Blue Shield");
  });

  it("flags low-confidence fields for review", () => {
    const r = extractFromOcr({ text: SAMPLE_INTAKE });
    for (const f of r.needsReview) {
      expect(f.confidence).toBeLessThan(0.7);
    }
  });

  it("returns residual text for anything unclaimed", () => {
    const r = extractFromOcr({
      text: "DOB: 03/14/1982\nFree text the patient wrote about themselves.",
    });
    expect(r.residual).toMatch(/Free text the patient wrote/);
    expect(r.residual).not.toMatch(/03\/14\/1982/);
  });
});

describe("toChartPatch", () => {
  it("buckets fields into auto-apply vs needs-review", () => {
    const r = extractFromOcr({ text: SAMPLE_INTAKE });
    const patch = toChartPatch(r);
    for (const f of patch.autoApply) expect(f.confidence).toBeGreaterThanOrEqual(0.7);
    for (const f of patch.review) expect(f.confidence).toBeLessThan(0.7);
  });

  it("returns an empty note addendum when there is no residual text", () => {
    const r = extractFromOcr({ text: "DOB: 03/14/1982" });
    const patch = toChartPatch(r);
    expect(patch.noteAddendum).toBe("");
  });

  it("includes residual text in the note addendum", () => {
    const r = extractFromOcr({ text: "DOB: 03/14/1982\nNon-structured prose." });
    const patch = toChartPatch(r);
    expect(patch.noteAddendum).toMatch(/Non-structured prose/);
    expect(patch.noteAddendum).toMatch(/OCR import — unparsed residual/);
  });
});
