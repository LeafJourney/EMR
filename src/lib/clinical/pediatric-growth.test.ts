import { describe, expect, it } from "vitest";
import {
  bmi,
  BMI_CATEGORY_LABELS,
  cdcBmiCategory,
  immunizationsDue,
  nextWellChild,
  PRIMARY_SERIES,
  WELL_CHILD_MONTHS,
} from "./pediatric-growth";

// EMR-083 — pediatric growth + immunization helpers

describe("bmi", () => {
  it("computes kg/m²", () => {
    expect(bmi(70, 175)).toBeCloseTo(22.86, 1);
  });

  it("returns NaN for zero or negative inputs", () => {
    expect(bmi(0, 175)).toBeNaN();
    expect(bmi(70, 0)).toBeNaN();
    expect(bmi(-1, 175)).toBeNaN();
  });
});

describe("cdcBmiCategory", () => {
  it("classifies a healthy 8yo male", () => {
    // 25 kg, 128 cm → ~15.3 → healthy band (under 17.8 healthyMax)
    const v = bmi(25, 128);
    expect(cdcBmiCategory(v, 8, "male")).toBe("healthy");
  });

  it("classifies an obese 8yo male", () => {
    // 40 kg, 128 cm → ~24.4 → above overweightMax (19.3) → obese
    const v = bmi(40, 128);
    expect(cdcBmiCategory(v, 8, "male")).toBe("obese");
  });

  it("classifies an underweight 12yo female", () => {
    // 30 kg, 150 cm → ~13.3 → below underweightMax (15.0) → underweight
    const v = bmi(30, 150);
    expect(cdcBmiCategory(v, 12, "female")).toBe("underweight");
  });

  it("clamps ages below 2 to the youngest band", () => {
    // 18 month old: ~10kg, 80cm → ~15.6 → at age 2 male underweightMax=14.7 →
    // 15.6 falls in healthy range
    const v = bmi(10, 80);
    expect(cdcBmiCategory(v, 1.5, "male")).toBe("healthy");
  });

  it("clamps ages above 20 to the oldest band", () => {
    const v = bmi(80, 170); // ~27.7 → male 20yo overweight band 25.5-28.5
    expect(cdcBmiCategory(v, 25, "male")).toBe("overweight");
  });

  it("interpolates between bands for in-between ages", () => {
    // For a 15yo male — between 14 (overweightMax 25.0) and 16 (26.6)
    // mid: ~25.8. A BMI of 25.2 should be overweight (over healthyMax interp).
    const v = 25.2;
    expect(cdcBmiCategory(v, 15, "male")).toBe("overweight");
  });

  it("has a clinician-facing label for every category", () => {
    for (const cat of ["underweight", "healthy", "overweight", "obese"] as const) {
      expect(BMI_CATEGORY_LABELS[cat]).toBeTruthy();
    }
  });
});

describe("nextWellChild", () => {
  it("returns the next AAP visit after the current age", () => {
    expect(nextWellChild(0)).toBe(1);
    expect(nextWellChild(1)).toBe(2);
    expect(nextWellChild(11)).toBe(12);
  });

  it("returns null after the last scheduled visit", () => {
    const last = WELL_CHILD_MONTHS[WELL_CHILD_MONTHS.length - 1]!;
    expect(nextWellChild(last)).toBeNull();
    expect(nextWellChild(last + 12)).toBeNull();
  });

  it("skips already-completed scheduled visits", () => {
    expect(nextWellChild(15)).toBe(18);
  });
});

describe("immunizationsDue", () => {
  it("returns DTaP #1 and friends for a healthy 2-month-old", () => {
    const gaps = immunizationsDue(2, [
      { cvx: "08", doseNumber: 1 }, // Hep B #1 already given
    ]);
    const labels = gaps.map((g) => g.dose.label);
    expect(labels).toContain("DTaP #1");
    expect(labels).toContain("PCV13 #1");
    expect(labels).toContain("Hep B #2");
    // Hep B #1 already done → excluded
    expect(labels).not.toContain("Hep B #1");
  });

  it("does not flag age-inappropriate vaccines as due", () => {
    const gaps = immunizationsDue(0, []);
    const labels = gaps.map((g) => g.dose.label);
    expect(labels).toContain("Hep B #1"); // age 0 OK
    expect(labels).not.toContain("MMR #1"); // earliest = 12 mo
    expect(labels).not.toContain("Varicella #2");
  });

  it("flags catch-up doses as overdue", () => {
    const gaps = immunizationsDue(24, []); // 24mo, no shots at all
    const hepB1 = gaps.find((g) => g.dose.label === "Hep B #1");
    expect(hepB1?.status).toBe("overdue");
  });

  it("returns no gaps when fully caught up", () => {
    const completed = PRIMARY_SERIES.map((d) => ({ cvx: d.cvx, doseNumber: d.doseNumber }));
    const gaps = immunizationsDue(120, completed);
    expect(gaps).toEqual([]);
  });
});
