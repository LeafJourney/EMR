import { describe, it, expect } from "vitest";
import {
  LAB_PANELS,
  renderMarkerLine,
  renderPanel,
  renderSlashLabPull,
} from "./lab-slash-pull";

const may16 = new Date("2026-05-16T10:00:00Z");
const feb14 = new Date("2026-02-14T10:00:00Z");

const maya = [
  { marker: "Hemoglobin A1c", value: "7.4%", unit: "", capturedAt: may16 },
  { marker: "Hemoglobin A1c", value: "7.1%", unit: "", capturedAt: feb14 },
  { marker: "Sodium", value: 139, unit: "mEq/L", capturedAt: may16 },
  { marker: "Potassium", value: 4.2, unit: "mEq/L", capturedAt: may16 },
  { marker: "Creatinine", value: 0.9, unit: "mg/dL", capturedAt: may16 },
  { marker: "eGFR", value: 88, unit: "mL/min/1.73m²", capturedAt: may16 },
  { marker: "Fasting Glucose", value: 142, unit: "mg/dL", capturedAt: may16 },
  { marker: "Total Cholesterol", value: 198, unit: "", capturedAt: may16 },
  { marker: "HDL", value: 52, unit: "", capturedAt: may16 },
  { marker: "VLDL", value: 18, unit: "", capturedAt: may16 },
  { marker: "LDL", value: 128, unit: "", capturedAt: may16 },
  { marker: "ApoB", value: 96, unit: "", capturedAt: may16 },
  { marker: "LpA", value: 18, unit: "mg/dL", capturedAt: may16 },
];

describe("lab slash-pull (EMR-702)", () => {
  it("renders the trended A1c line exactly as the Maya Reyes fixture", () => {
    expect(renderMarkerLine(maya, "Hemoglobin A1c")).toBe(
      "Hemoglobin A1c: 7.4% (5/16). Previous: 7.1% (2/14).",
    );
  });

  it("/HbA1c expands to the trended single-marker line", () => {
    const out = renderSlashLabPull(maya, "/HbA1c");
    expect(out).toContain("Hemoglobin A1c: 7.4%");
    expect(out).toContain("Previous: 7.1%");
  });

  it("/BMP renders Sodium, Potassium, Creatinine, eGFR, Fasting Glucose inline", () => {
    const out = renderSlashLabPull(maya, "/BMP");
    expect(out).toContain("BMP —");
    expect(out).toContain("Sodium: 139 mEq/L");
    expect(out).toContain("Potassium: 4.2 mEq/L");
    expect(out).toContain("Creatinine: 0.9 mg/dL");
    expect(out).toContain("eGFR: 88 mL/min/1.73m²");
    expect(out).toContain("Fasting Glucose: 142 mg/dL");
  });

  it("/lipid renders the lipid panel with all six markers", () => {
    const out = renderSlashLabPull(maya, "/lipid");
    expect(out).toContain("Lipid panel —");
    for (const m of ["Total Cholesterol", "HDL", "VLDL", "LDL", "ApoB", "LpA"]) {
      expect(out, `missing ${m}`).toContain(m);
    }
  });

  it("/labs concatenates every panel that has data", () => {
    const out = renderSlashLabPull(maya, "/labs");
    expect(out.split("\n").length).toBe(3); // A1c + BMP + Lipid
  });

  it("returns empty string for unknown slash command", () => {
    expect(renderSlashLabPull(maya, "/no-such-marker")).toBe("");
  });

  it("single value with no previous renders without 'Previous:' tail", () => {
    const single = [
      { marker: "Hemoglobin A1c", value: "7.4%", unit: "", capturedAt: may16 },
    ];
    const line = renderMarkerLine(single, "Hemoglobin A1c");
    expect(line).toBe("Hemoglobin A1c: 7.4% (5/16).");
    expect(line).not.toContain("Previous");
  });

  it("panel returns null when no markers have data", () => {
    expect(renderPanel([], "bmp")).toBe(null);
  });

  it("LAB_PANELS exposes the three first-class panels", () => {
    expect(LAB_PANELS.map((p) => p.slug).sort()).toEqual(["bmp", "hba1c", "lipid"]);
  });
});
