import { describe, expect, it } from "vitest";
import { MED_DIRECTORY, searchMedications } from "./medication-search";

// EMR-885 — unified medication search directory

describe("MED_DIRECTORY", () => {
  it("is non-empty and spans all five medication classes", () => {
    expect(MED_DIRECTORY.length).toBeGreaterThanOrEqual(40);
    const classes = new Set(MED_DIRECTORY.map((e) => e.medClass));
    for (const c of ["pharmaceutical", "cannabis", "nutraceutical", "otc", "psilocybin"]) {
      expect(classes.has(c as never)).toBe(true);
    }
  });

  it("gives every entry a name and at least one strength", () => {
    for (const e of MED_DIRECTORY) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.strengths.length).toBeGreaterThan(0);
    }
  });
});

describe("searchMedications", () => {
  it("matches by case-insensitive prefix on name", () => {
    const r = searchMedications("lis");
    expect(r.some((e) => e.name === "Lisinopril")).toBe(true);
  });

  it("matches cannabis products by brand", () => {
    const r = searchMedications("camino", { classes: ["cannabis"] });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.medClass === "cannabis")).toBe(true);
    expect(r.some((e) => e.name.startsWith("Camino"))).toBe(true);
  });

  it("respects the class filter and the default limit of 8", () => {
    const all = searchMedications("");
    expect(all.length).toBe(8);
    const otc = searchMedications("", { classes: ["otc"] });
    expect(otc.every((e) => e.medClass === "otc")).toBe(true);
  });

  it("ranks prefix hits ahead of substring hits", () => {
    // "met" prefixes Metformin; substring of nothing obviously else first.
    const r = searchMedications("met");
    expect(r[0]?.name).toBe("Metformin");
  });

  it("honors a custom limit", () => {
    const r = searchMedications("", { limit: 3 });
    expect(r.length).toBe(3);
  });
});
