import { describe, it, expect } from "vitest";
import { mapLabResultRow, type LabResultRow } from "./lab-results";

function row(overrides: Partial<LabResultRow> = {}): LabResultRow {
  return {
    id: "lab-1",
    panelName: "Comprehensive Metabolic Panel",
    receivedAt: new Date("2026-05-20T12:00:00.000Z"),
    signedAt: null,
    results: {
      Glucose: { value: 95, unit: "mg/dL", refLow: 70, refHigh: 100, abnormal: false },
      ALT: { value: 62, unit: "U/L", refLow: 7, refHigh: 55, abnormal: true },
    },
    ...overrides,
  };
}

describe("mapLabResultRow", () => {
  it("maps markers and classifies status from the reference range", () => {
    const panel = mapLabResultRow(row());
    expect(panel.id).toBe("lab-1");
    expect(panel.name).toBe("Comprehensive Metabolic Panel");
    expect(panel.results).toHaveLength(2);

    const glucose = panel.results.find((r) => r.name === "Glucose")!;
    expect(glucose.value).toBe(95);
    expect(glucose.referenceRange).toEqual({ low: 70, high: 100 });
    expect(glucose.status).toBe("normal");

    const alt = panel.results.find((r) => r.name === "ALT")!;
    // 62 > refHigh 55 → high (classified from the range, not the flag).
    expect(alt.status).toBe("high");
  });

  it("marks unsigned panels partial and signed panels complete", () => {
    expect(mapLabResultRow(row()).status).toBe("partial");
    expect(
      mapLabResultRow(row({ signedAt: new Date("2026-05-21T09:00:00.000Z") }))
        .status,
    ).toBe("complete");
  });

  it("omits the reference range when the marker has none, falling back to the abnormal flag", () => {
    const panel = mapLabResultRow(
      row({
        results: {
          "Vitamin D": { value: 18, unit: "ng/mL", abnormal: true },
          TSH: { value: 2.1, unit: "mIU/L", abnormal: false },
        },
      }),
    );
    const vitD = panel.results.find((r) => r.name === "Vitamin D")!;
    expect(vitD.referenceRange).toBeUndefined();
    expect(vitD.status).toBe("high"); // abnormal flag, direction unknown
    const tsh = panel.results.find((r) => r.name === "TSH")!;
    expect(tsh.referenceRange).toBeUndefined();
    expect(tsh.status).toBe("normal");
  });

  it("drops malformed markers and tolerates non-object JSON", () => {
    const panel = mapLabResultRow(
      row({
        results: {
          Good: { value: 5, unit: "x", refLow: 1, refHigh: 10, abnormal: false },
          Bad: { unit: "x", abnormal: false }, // no numeric value
          AlsoBad: "not-an-object",
        },
      }),
    );
    expect(panel.results.map((r) => r.name)).toEqual(["Good"]);
    expect(mapLabResultRow(row({ results: null })).results).toEqual([]);
    expect(mapLabResultRow(row({ results: "nope" })).results).toEqual([]);
  });
});
