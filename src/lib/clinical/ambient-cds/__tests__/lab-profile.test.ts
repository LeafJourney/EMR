// Biomarker assembler — cross-panel marker resolution (EMR-1128).

import { describe, expect, it } from "vitest";
import {
  assembleBiomarkers,
  classifyMarker,
  metabolicMarkerNames,
  type LabRowForIr,
} from "../lab-profile";

describe("classifyMarker", () => {
  it("maps the three IR biomarker classes", () => {
    expect(classifyMarker("Glucose")).toBe("fastingGlucose");
    expect(classifyMarker("Glucose, Fasting")).toBe("fastingGlucose");
    expect(classifyMarker("Insulin")).toBe("fastingInsulin");
    expect(classifyMarker("HbA1c")).toBe("hba1c");
    expect(classifyMarker("A1C")).toBe("hba1c");
  });

  it("avoids the classic look-alike traps", () => {
    expect(classifyMarker("Estimated Average Glucose")).toBeNull(); // eAG
    expect(classifyMarker("Glucose Tolerance 2hr")).toBeNull();
    expect(classifyMarker("Insulin-like Growth Factor 1")).toBeNull(); // IGF-1
    expect(classifyMarker("Sodium")).toBeNull();
  });

  it("classifies A1c before the average-glucose substring can win", () => {
    // a marker literally named with both — A1c wins, never glucose
    expect(classifyMarker("Hemoglobin A1c")).toBe("hba1c");
  });
});

describe("metabolicMarkerNames", () => {
  it("returns the present marker name per class from a results blob", () => {
    const names = metabolicMarkerNames({
      Glucose: { value: 105, unit: "mg/dL" },
      Insulin: { value: 12, unit: "uIU/mL" },
      Sodium: { value: 140, unit: "mmol/L" },
    });
    expect(names).toEqual({ fastingGlucose: "Glucose", fastingInsulin: "Insulin" });
  });

  it("ignores non-numeric markers and non-object input", () => {
    expect(metabolicMarkerNames({ Glucose: { unit: "mg/dL" } })).toEqual({});
    expect(metabolicMarkerNames(null)).toEqual({});
    expect(metabolicMarkerNames("nope")).toEqual({});
  });
});

describe("assembleBiomarkers", () => {
  const rows: LabRowForIr[] = [
    {
      panelName: "CMP",
      receivedAt: "2026-06-10T00:00:00.000Z",
      results: { Glucose: { value: 105, unit: "mg/dL" }, Sodium: { value: 140 } },
    },
    {
      panelName: "Insulin",
      receivedAt: "2026-06-09T00:00:00.000Z",
      results: { Insulin: { value: 12, unit: "uIU/mL" } },
    },
    {
      panelName: "HbA1c",
      receivedAt: "2026-05-01T00:00:00.000Z",
      results: { HbA1c: { value: 5.9, unit: "%" } },
    },
  ];

  it("resolves glucose, insulin, and A1c across separate panels", () => {
    const { panel, sources } = assembleBiomarkers(rows);
    expect(panel.fastingGlucoseMgDl).toBe(105);
    expect(panel.fastingInsulinUIuMl).toBe(12);
    expect(panel.hba1cPct).toBe(5.9);
    expect(sources.fastingGlucose?.panelName).toBe("CMP");
    expect(sources.fastingInsulin?.markerName).toBe("Insulin");
  });

  it("anchors drawnAt to the OLDER half of the HOMA-IR pair", () => {
    const { panel } = assembleBiomarkers(rows);
    // insulin (06-09) is older than glucose (06-10) → drawnAt = insulin date
    expect(panel.drawnAt).toBe("2026-06-09T00:00:00.000Z");
  });

  it("keeps the most recent value when a marker repeats across rows", () => {
    const dupes: LabRowForIr[] = [
      {
        panelName: "CMP",
        receivedAt: "2026-06-01T00:00:00.000Z",
        results: { Glucose: { value: 99 } },
      },
      {
        panelName: "CMP",
        receivedAt: "2026-06-12T00:00:00.000Z",
        results: { Glucose: { value: 118 } },
      },
    ];
    const { panel, sources } = assembleBiomarkers(dupes);
    expect(panel.fastingGlucoseMgDl).toBe(118);
    expect(sources.fastingGlucose?.observedAt).toBe("2026-06-12T00:00:00.000Z");
  });

  it("yields a partial panel (and no drawnAt crash) when inputs are sparse", () => {
    const { panel } = assembleBiomarkers([
      {
        panelName: "CMP",
        receivedAt: "2026-06-10T00:00:00.000Z",
        results: { Glucose: { value: 100 } },
      },
    ]);
    expect(panel.fastingGlucoseMgDl).toBe(100);
    expect(panel.fastingInsulinUIuMl).toBeUndefined();
    expect(panel.drawnAt).toBe("2026-06-10T00:00:00.000Z");
  });
});
