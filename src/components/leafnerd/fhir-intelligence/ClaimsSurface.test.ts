import { describe, it, expect } from "vitest";
import {
  classifyMismatch,
  formatMoney,
  extractIcd10,
  summarize,
  cptLabel,
  icdLabel,
} from "./ClaimsSurface";
import type { ClaimAnomalyRow } from "@/lib/leafnerd/types";

function row(partial: Partial<ClaimAnomalyRow>): ClaimAnomalyRow {
  return {
    id: "anom-x",
    claimId: "CLM-X",
    code: "99214",
    description: "",
    severity: "med",
    amount: 100,
    scrubbedAt: "2026-06-02T09:00:00.000Z",
    ...partial,
  };
}

describe("classifyMismatch", () => {
  it("detects a missing modifier -25", () => {
    const m = classifyMismatch(
      row({
        description:
          "Missing modifier -25: E/M billed same day as a procedure without a distinct-service modifier.",
        severity: "high",
        code: "99214",
      })
    );
    expect(m.kind).toBe("modifier-25");
    expect(m.badge).toBe("Modifier -25");
    expect(m.tone).toBe("rose"); // high severity
    expect(m.detail).toContain("99214");
    expect(m.recommendation).toMatch(/modifier -25/i);
  });

  it("detects an NCCI bundling conflict", () => {
    const m = classifyMismatch(
      row({
        description:
          "NCCI bundling conflict: 96372 is mutually exclusive with the primary procedure.",
        code: "96372",
        severity: "med",
      })
    );
    expect(m.kind).toBe("ncci");
    expect(m.rule).toMatch(/NCCI/);
    expect(m.tone).toBe("amber"); // non-high severity
  });

  it("detects an MUE exceedance", () => {
    const m = classifyMismatch(
      row({
        description:
          "MUE exceeded: comprehensive metabolic panel units exceed the medically-unlikely-edit threshold.",
        code: "80053",
        severity: "low",
      })
    );
    expect(m.kind).toBe("mue");
    expect(m.rule).toMatch(/Medically Unlikely Edit/);
  });

  it("detects a diagnosis-to-procedure mismatch and references the ICD-10 code", () => {
    const m = classifyMismatch(
      row({
        description:
          "Diagnosis-to-procedure mismatch: ICD-10 F41.1 does not support the billed level-3 evaluation code.",
        code: "99213",
      })
    );
    expect(m.kind).toBe("dx-mismatch");
    expect(m.detail).toContain("F41.1");
    expect(m.detail).toContain("99213");
  });

  it("falls back to a generic coding edit and echoes the description", () => {
    const m = classifyMismatch(
      row({ description: "Place of service code is inconsistent with the rendering provider." })
    );
    expect(m.kind).toBe("coding");
    expect(m.detail).toContain("Place of service");
  });

  it("maps severity to tone (high -> rose, otherwise amber)", () => {
    expect(classifyMismatch(row({ severity: "high" })).tone).toBe("rose");
    expect(classifyMismatch(row({ severity: "med" })).tone).toBe("amber");
    expect(classifyMismatch(row({ severity: "low" })).tone).toBe("amber");
    expect(classifyMismatch(row({ severity: undefined })).tone).toBe("amber");
  });
});

describe("extractIcd10", () => {
  it("pulls the first ICD-10 token from free text", () => {
    expect(extractIcd10("ICD-10 F41.1 does not support the code")).toBe("F41.1");
    expect(extractIcd10("supports E11.9 with notes")).toBe("E11.9");
    expect(extractIcd10("hypertension I10 documented")).toBe("I10");
  });

  it("returns null when no diagnosis code is present", () => {
    expect(extractIcd10("Missing modifier -25 on the E/M line")).toBeNull();
    expect(extractIcd10("units exceed 99214 threshold")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("formats dollar amounts", () => {
    expect(formatMoney(248)).toBe("$248.00");
    expect(formatMoney(54.25)).toBe("$54.25");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });

  it("returns an em dash for missing/NaN amounts", () => {
    expect(formatMoney(undefined)).toBe("—");
    expect(formatMoney(NaN)).toBe("—");
  });
});

describe("summarize", () => {
  it("counts flagged claims and sums revenue at risk", () => {
    const rows = [
      row({ id: "a", amount: 248 }),
      row({ id: "b", amount: 86.5 }),
      row({ id: "c", amount: undefined }),
    ];
    expect(summarize(rows)).toEqual({ flagged: 3, atRisk: 334.5 });
  });

  it("handles an empty list", () => {
    expect(summarize([])).toEqual({ flagged: 0, atRisk: 0 });
  });
});

describe("code labels", () => {
  it("maps known CPT/ICD codes and falls back otherwise", () => {
    expect(cptLabel("99214")).toBe("Level 4 office / outpatient visit");
    expect(cptLabel("00000")).toBe("Procedure code");
    expect(cptLabel(undefined)).toBe("Procedure code");
    expect(icdLabel("F41.1")).toBe("Generalized anxiety disorder");
    expect(icdLabel(null)).toBe("Linked diagnosis");
  });
});
