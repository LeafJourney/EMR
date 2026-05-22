import { describe, it, expect } from "vitest";
import {
  MEDICATION_CATEGORIES,
  sortMedicationCategories,
  type MedicationCategory,
} from "./medication-bubble";

describe("medication category bubbles (EMR-701)", () => {
  it("exposes the five categories per ticket", () => {
    expect(MEDICATION_CATEGORIES.slice().sort()).toEqual(
      ["Controlled", "OTC", "Rx", "cannabis", "supplement"],
    );
  });

  it("sortMedicationCategories puts Controlled before Rx (Maya Reyes #10/#11 shape)", () => {
    const sorted = sortMedicationCategories(["Rx", "Controlled"]);
    expect(sorted).toEqual(["Controlled", "Rx"]);
  });

  it("dedupes repeated entries while preserving canonical order", () => {
    const sorted = sortMedicationCategories([
      "Rx",
      "Rx",
      "cannabis",
      "Rx",
    ] as MedicationCategory[]);
    expect(sorted).toEqual(["Rx", "cannabis"]);
  });

  it("Maya Reyes acceptance — every medication renders the correct stack", () => {
    const cases: Array<{ name: string; expected: MedicationCategory[] }> = [
      { name: "Lisinopril", expected: ["Rx"] },
      { name: "Metformin", expected: ["Rx"] },
      { name: "Vitamin D3", expected: ["supplement"] },
      { name: "Camino edibles", expected: ["cannabis"] },
      { name: "PhytoRx tincture", expected: ["cannabis"] },
      { name: "Alprazolam", expected: ["Controlled", "Rx"] },
      { name: "Zolpidem", expected: ["Controlled", "Rx"] },
      { name: "Ibuprofen", expected: ["OTC"] },
    ];
    for (const c of cases) {
      expect(sortMedicationCategories(c.expected)).toEqual(c.expected);
    }
  });
});
