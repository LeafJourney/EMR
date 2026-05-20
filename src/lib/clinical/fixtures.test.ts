import { describe, it, expect } from "vitest";
import {
  loadClinicalFixture,
  MAYA_REYES_FIXTURE_IDS,
} from "./fixtures";

describe("clinical fixtures — Maya Reyes", () => {
  it("loads both variants without throwing", () => {
    for (const id of MAYA_REYES_FIXTURE_IDS) {
      const md = loadClinicalFixture(id);
      expect(md.length).toBeGreaterThan(500);
    }
  });

  it("full variant contains the four ICD-10 problems from EMR-704", () => {
    const md = loadClinicalFixture("maya-reyes-pain-mgmt-v1");
    expect(md).toContain("I10");
    expect(md).toContain("E11.9");
    expect(md).toContain("E78.00");
    expect(md).toContain("M25.512");
  });

  it("demonstrates the vital-sign repeat-reading syntax from EMR-704", () => {
    const md = loadClinicalFixture("maya-reyes-pain-mgmt-v1");
    expect(md).toContain("134/82 >> (repeat) 120/80");
  });

  it("demonstrates A1c current-vs-previous lab trending from EMR-702", () => {
    const md = loadClinicalFixture("maya-reyes-pain-mgmt-v1");
    expect(md).toContain("Hemoglobin A1c: 7.4% (5/16). Previous: 7.1% (2/14).");
  });

  it("references the four EMR-703 slash-command seed entries", () => {
    const md = loadClinicalFixture("maya-reyes-pain-mgmt-v1");
    expect(md).toMatch(/`\/blood pressure`/);
    expect(md).toMatch(/`\/blood glucose`/);
    expect(md).toMatch(/`\/cholesterol`/);
    expect(md).toMatch(/`\/shoulder pain`/);
  });

  it("no-cannabis variant strips Camino/PhytoRx from the meds table but keeps every other med", () => {
    const stripped = loadClinicalFixture("maya-reyes-pain-mgmt-v1-no-cannabis");
    // Header comment names the removed meds — strip it before checking table.
    const tableSection = stripped
      .split("\n")
      .filter((l) => l.startsWith("|"))
      .join("\n");
    expect(tableSection).not.toMatch(/Camino/);
    expect(tableSection).not.toMatch(/PhytoRx/);
    expect(tableSection).toContain("Lisinopril");
    expect(tableSection).toContain("Alprazolam");
  });
});
