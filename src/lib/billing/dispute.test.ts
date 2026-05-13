import { describe, expect, it } from "vitest";
import {
  canTransition,
  classifyMarker,
  classifyPanel,
  draftAiResolution,
  isTerminal,
  listReasonOptions,
  patientStatusCopy,
  reasonLabel,
  suggestForAbnormal,
} from "./dispute";

describe("dispute reason copy", () => {
  it("provides a label for every reason", () => {
    const options = listReasonOptions();
    expect(options).toHaveLength(8);
    for (const opt of options) {
      expect(reasonLabel(opt.value)).toBe(opt.label);
      expect(opt.label.length).toBeGreaterThan(0);
    }
  });
});

describe("canTransition", () => {
  it("allows the standard happy path", () => {
    expect(canTransition("submitted", "under_review")).toEqual({ ok: true });
    expect(canTransition("under_review", "resolved_corrected")).toEqual({
      ok: true,
    });
    expect(canTransition("under_review", "awaiting_patient")).toEqual({
      ok: true,
    });
    expect(canTransition("awaiting_patient", "under_review")).toEqual({
      ok: true,
    });
  });

  it("blocks moves out of terminal states", () => {
    expect(canTransition("resolved_corrected", "under_review").ok).toBe(false);
    expect(canTransition("resolved_upheld", "submitted").ok).toBe(false);
    expect(canTransition("withdrawn", "under_review").ok).toBe(false);
  });

  it("blocks no-op self-transitions", () => {
    expect(canTransition("submitted", "submitted").ok).toBe(false);
  });
});

describe("isTerminal", () => {
  it("only marks resolved/withdrawn as terminal", () => {
    expect(isTerminal("resolved_corrected")).toBe(true);
    expect(isTerminal("resolved_upheld")).toBe(true);
    expect(isTerminal("withdrawn")).toBe(true);
    expect(isTerminal("submitted")).toBe(false);
    expect(isTerminal("under_review")).toBe(false);
    expect(isTerminal("awaiting_patient")).toBe(false);
  });
});

describe("patientStatusCopy", () => {
  it("returns plain-language copy for every status", () => {
    expect(patientStatusCopy("submitted")).toContain("billing team");
    expect(patientStatusCopy("awaiting_patient")).toContain("you");
    expect(patientStatusCopy("resolved_corrected")).toContain("adjusted");
    expect(patientStatusCopy("withdrawn")).toContain("withdrew");
  });
});

describe("draftAiResolution", () => {
  const statement = {
    statementNumber: "STM-2026-001",
    totalChargesCents: 24500,
    insurancePaidCents: 15000,
    amountDueCents: 9500,
    lineItems: [
      { description: "Office visit, established", amountCents: 12000, cptCode: "99213" },
      { description: "Cannabis counseling 30min", amountCents: 12500 },
    ],
  };

  it("includes the statement totals", () => {
    const out = draftAiResolution({
      reason: "insurance_should_cover",
      patientNarrative: "I have BCBS PPO",
      statement,
      disputedAmountCents: 9500,
    });
    expect(out).toContain("STM-2026-001");
    expect(out).toContain("$245.00");
    expect(out).toContain("$150.00");
    expect(out).toContain("$95.00");
    expect(out).toContain("eligibility check");
  });

  it("flags identity-concern disputes as P0", () => {
    const out = draftAiResolution({
      reason: "identity_concern",
      patientNarrative: "Not my charge",
      statement,
    });
    expect(out).toContain("P0");
  });

  it("includes line items in the summary", () => {
    const out = draftAiResolution({
      reason: "charge_unrecognized",
      patientNarrative: "?",
      statement,
    });
    expect(out).toContain("99213");
    expect(out).toContain("Cannabis counseling");
  });
});

describe("classifyMarker", () => {
  it("returns green when in reference range", () => {
    expect(
      classifyMarker({ value: 100, refLow: 70, refHigh: 110 }),
    ).toBe("green");
  });

  it("returns yellow for mild deviations", () => {
    expect(
      classifyMarker({ value: 115, refLow: 70, refHigh: 110 }),
    ).toBe("yellow");
  });

  it("returns red for severe deviations (>25% drift)", () => {
    // 200 vs refHigh 110 → drift = 81% → red
    expect(
      classifyMarker({ value: 200, refLow: 70, refHigh: 110 }),
    ).toBe("red");
  });

  it("respects explicit critical thresholds", () => {
    expect(
      classifyMarker({
        value: 50,
        refLow: 70,
        refHigh: 110,
        criticalLow: 60,
      }),
    ).toBe("red");
  });

  it("handles missing reference ranges by returning green", () => {
    expect(classifyMarker({ value: 100 })).toBe("green");
  });
});

describe("classifyPanel", () => {
  it("rolls up to the worst marker", () => {
    const panel = classifyPanel({
      panelName: "CMP",
      markers: {
        glucose: { value: 90, refLow: 70, refHigh: 100 }, // green
        creatinine: { value: 1.2, refLow: 0.6, refHigh: 1.2 }, // green
        alt: { value: 250, refLow: 7, refHigh: 56 }, // red
        ast: { value: 75, refLow: 10, refHigh: 40 }, // yellow (drift 87% → red actually)
      },
    });
    expect(panel.worstMarker).toBe("red");
    expect(panel.redCount).toBeGreaterThanOrEqual(1);
    expect(panel.abnormalMarkers.find((m) => m.name === "alt")).toBeDefined();
  });

  it("returns all green when nothing is off", () => {
    const panel = classifyPanel({
      panelName: "CBC",
      markers: {
        wbc: { value: 7.5, refLow: 4, refHigh: 10 },
        hgb: { value: 14, refLow: 12, refHigh: 16 },
      },
    });
    expect(panel.worstMarker).toBe("green");
    expect(panel.abnormalMarkers).toHaveLength(0);
  });
});

describe("suggestForAbnormal", () => {
  it("returns null for green markers", () => {
    expect(suggestForAbnormal("HbA1c", "green")).toBeNull();
  });

  it("returns specialized guidance for known markers", () => {
    expect(suggestForAbnormal("HbA1c", "red")).toContain("glycemic");
    expect(suggestForAbnormal("ALT", "yellow")).toContain("Liver");
    expect(suggestForAbnormal("LDL", "red")).toContain("statin");
    expect(suggestForAbnormal("eGFR", "yellow")).toContain("Renal");
    expect(suggestForAbnormal("TSH", "red")).toContain("Thyroid");
  });

  it("falls back to a generic suggestion for unknown markers", () => {
    expect(suggestForAbnormal("vitamin_q", "yellow")).toContain("reference range");
    expect(suggestForAbnormal("vitamin_q", "red")).toContain("critical band");
  });
});
