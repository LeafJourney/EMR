import { describe, it, expect } from "vitest";
import {
  expandAbbreviationsForPatient,
  hasUnambiguousExpansion,
  listAbbreviations,
  lookupAbbreviation,
  suggestExpansions,
} from "./abbreviations";

describe("medical abbreviation registry (EMR-706)", () => {
  it("contains every abbreviation demonstrated in the Maya Reyes fixture", () => {
    const required = [
      "HLD", "HTN", "DM",
      "PMHx", "NKDA", "HPI", "ROS",
      "BP", "HR", "T", "RR", "Wt",
      "NCAT", "HEENT", "S1/S2",
      "BMP", "eGFR", "HDL", "VLDL", "LDL", "ApoB", "LpA",
      "qday", "qHS", "BID", "TID", "PRN", "PO",
      "PT", "ROM",
      "mEq/L", "mg/dL", "mL/min/1.73m²",
      "ICD-10", "NPI", "DEA", "MA",
      "f/u", "qYear",
      "ACE inhibitor", "SGLT2",
    ];
    for (const abbr of required) {
      const matches = lookupAbbreviation(abbr);
      expect(matches, `missing abbreviation: ${abbr}`).not.toHaveLength(0);
    }
  });

  it("flags single-meaning abbreviations as unambiguous", () => {
    expect(hasUnambiguousExpansion("BID")).toBe(true);
    expect(hasUnambiguousExpansion("nope")).toBe(false);
  });

  it("typeahead prefix match is case-insensitive and bounded", () => {
    const matches = suggestExpansions("PR", 4);
    expect(matches.length).toBeGreaterThanOrEqual(1);
    expect(matches.map((m) => m.abbr)).toContain("PRN");
    expect(matches.length).toBeLessThanOrEqual(4);
  });

  it("declares all four required source corpora at least once", () => {
    const sources = new Set<string>();
    for (const entry of listAbbreviations()) {
      for (const s of entry.sources) sources.add(s);
    }
    expect(sources.has("NCCEP")).toBe(true);
    expect(sources.has("Tabers")).toBe(true);
    expect(sources.has("Skriber")).toBe(true);
    expect(sources.has("HeidiHealth")).toBe(true);
  });

  it("patient-facing expansion spells out unambiguous tokens, leaves prose alone", () => {
    const expanded = expandAbbreviationsForPatient("Take 1 tab PO BID for 7 days");
    expect(expanded).toContain("by mouth");
    expect(expanded).toContain("twice daily");
  });
});
