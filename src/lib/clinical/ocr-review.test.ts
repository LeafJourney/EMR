import { describe, expect, it } from "vitest";
import {
  buildOcrReview,
  SAMPLE_DISCHARGE_TEXT,
  DEMO_CHART,
} from "./ocr-review";

// EMR-081 — OCR scan & auto-populate review view-model.

describe("buildOcrReview", () => {
  const review = buildOcrReview(
    { text: SAMPLE_DISCHARGE_TEXT, documentType: "discharge_summary" },
    DEMO_CHART,
  );

  it("extracts a structured field for each recognized item", () => {
    expect(review.fieldsFound).toBeGreaterThan(8);
    // every plan item belongs to exactly one bucket
    const total =
      review.autoApply.length +
      review.needsReview.length +
      review.duplicates.length;
    expect(total).toBe(review.fieldsFound);
  });

  it("routes a matching DOB to duplicates", () => {
    const dob = [...review.autoApply, ...review.needsReview, ...review.duplicates].find(
      (i) => i.field.path === "dob",
    );
    expect(dob?.decision).toBe("duplicate");
  });

  it("flags a differing phone number as a conflict needing review", () => {
    const phone = review.needsReview.find((i) => i.field.path === "phone");
    expect(phone).toBeDefined();
    expect(phone?.decision).toBe("conflict");
    expect(phone?.existingValue).toBe("(714) 555-0102");
  });

  it("treats a same-drug different-dose medication as a conflict", () => {
    const lisinopril = review.needsReview.find(
      (i) => i.field.kind === "medication" && /lisinopril/i.test(i.field.value),
    );
    expect(lisinopril?.decision).toBe("conflict");
  });

  it("auto-applies a brand-new problem code", () => {
    const e11 = review.autoApply.find((i) => i.field.value === "E11.9");
    expect(e11).toBeDefined();
    expect(e11?.decision).toBe("add");
  });

  it("summarizes counts by field kind", () => {
    const kinds = review.byKind.map((k) => k.kind);
    expect(kinds).toContain("vital");
    expect(kinds).toContain("medication");
    const sum = review.byKind.reduce((acc, k) => acc + k.count, 0);
    expect(sum).toBe(review.fieldsFound);
  });

  it("keeps unparsed prose as a note addendum", () => {
    expect(review.noteAddendum).toMatch(/OCR import/);
    expect(review.residual.length).toBeGreaterThan(0);
  });

  it("produces no plan items for empty text", () => {
    const empty = buildOcrReview({ text: "" }, {});
    expect(empty.fieldsFound).toBe(0);
    expect(empty.autoApply).toHaveLength(0);
    expect(empty.needsReview).toHaveLength(0);
    expect(empty.duplicates).toHaveLength(0);
    expect(empty.noteAddendum).toBe("");
  });
});
