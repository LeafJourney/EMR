// EMR-766 — terminology lookup tests.

import { describe, it, expect } from "vitest";
import { lookup, isTerminologySystem } from "./index";

describe("terminology.lookup", () => {
  it("returns a hit for a seeded LOINC code", () => {
    expect(lookup("loinc", "72514-3")).toEqual({
      code: "72514-3",
      display: "Pain severity - 0-10 verbal numeric rating",
      system: "http://loinc.org",
      version: "2.77",
    });
  });

  it("returns a hit for a seeded SNOMED code", () => {
    const hit = lookup("snomed", "82423001");
    expect(hit?.display).toBe("Chronic pain");
    expect(hit?.system).toBe("http://snomed.info/sct");
  });

  it("returns a hit for a seeded RxNorm code", () => {
    expect(lookup("rxnorm", "1191")?.display).toBe("aspirin");
  });

  it("returns a hit for a seeded ICD-10 code (case-flex)", () => {
    expect(lookup("icd10", "g89")?.display).toBe(
      "Pain, not elsewhere classified",
    );
  });

  it("returns null for an unknown code", () => {
    expect(lookup("loinc", "99999-X")).toBe(null);
  });
});

describe("isTerminologySystem", () => {
  it.each(["loinc", "snomed", "rxnorm", "icd10"])("accepts %s", (s) => {
    expect(isTerminologySystem(s)).toBe(true);
  });

  it("rejects unknown systems", () => {
    expect(isTerminologySystem("medra")).toBe(false);
    expect(isTerminologySystem("")).toBe(false);
  });
});
