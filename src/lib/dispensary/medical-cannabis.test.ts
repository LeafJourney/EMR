import { describe, expect, it } from "vitest";
import {
  canTransitionRx,
  checkCardEligibility,
  checkDispenseBounds,
  dispenseToMedication,
  normalizePdmpFlags,
  pdmpFlagLabel,
  validateBudtenderSignature,
} from "./medical-cannabis";

const NOW = new Date("2026-05-12T00:00:00Z");

describe("checkCardEligibility", () => {
  it("accepts an active card with a future expiry", () => {
    expect(
      checkCardEligibility({
        status: "active",
        expiresOn: new Date("2027-05-12T00:00:00Z"),
        now: NOW,
      }),
    ).toEqual({ eligible: true });
  });

  it("rejects revoked, pending, expired", () => {
    expect(
      checkCardEligibility({
        status: "revoked",
        expiresOn: new Date("2027-01-01"),
        now: NOW,
      }).eligible,
    ).toBe(false);
    expect(
      checkCardEligibility({
        status: "pending",
        expiresOn: new Date("2027-01-01"),
        now: NOW,
      }).eligible,
    ).toBe(false);
    expect(
      checkCardEligibility({
        status: "expired",
        expiresOn: new Date("2027-01-01"),
        now: NOW,
      }).eligible,
    ).toBe(false);
  });

  it("rejects an active card whose expiry has already passed", () => {
    const result = checkCardEligibility({
      status: "active",
      expiresOn: new Date("2025-01-01T00:00:00Z"),
      now: NOW,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.reason).toContain("expired on 2025-01-01");
  });
});

describe("canTransitionRx", () => {
  it("walks the happy-path", () => {
    expect(canTransitionRx("draft", "sent_to_dispensary").ok).toBe(true);
    expect(canTransitionRx("sent_to_dispensary", "approved_by_dispensary").ok).toBe(true);
    expect(canTransitionRx("approved_by_dispensary", "partially_dispensed").ok).toBe(true);
    expect(canTransitionRx("partially_dispensed", "fully_dispensed").ok).toBe(true);
  });

  it("blocks moves out of terminal states", () => {
    expect(canTransitionRx("fully_dispensed", "partially_dispensed").ok).toBe(false);
    expect(canTransitionRx("rejected_by_dispensary", "approved_by_dispensary").ok).toBe(false);
    expect(canTransitionRx("cancelled", "draft").ok).toBe(false);
  });

  it("forbids the self-transition", () => {
    expect(canTransitionRx("draft", "draft").ok).toBe(false);
  });
});

describe("checkDispenseBounds", () => {
  it("accepts a dispense within the authorized total", () => {
    const r = checkDispenseBounds({
      rxQuantity: 30,
      rxRefills: 2,
      alreadyDispensedQuantity: 0,
      requestedQuantity: 30,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.remainingAfter).toBe(60); // 90 total - 30
      expect(r.isFinalFill).toBe(false);
    }
  });

  it("marks the last fill as final", () => {
    const r = checkDispenseBounds({
      rxQuantity: 30,
      rxRefills: 1,
      alreadyDispensedQuantity: 30,
      requestedQuantity: 30,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.isFinalFill).toBe(true);
  });

  it("rejects overdraws", () => {
    const r = checkDispenseBounds({
      rxQuantity: 30,
      rxRefills: 0,
      alreadyDispensedQuantity: 20,
      requestedQuantity: 15,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("Only 10");
  });

  it("rejects zero or negative quantities", () => {
    expect(
      checkDispenseBounds({
        rxQuantity: 30,
        rxRefills: 0,
        alreadyDispensedQuantity: 0,
        requestedQuantity: 0,
      }).ok,
    ).toBe(false);
    expect(
      checkDispenseBounds({
        rxQuantity: 30,
        rxRefills: 0,
        alreadyDispensedQuantity: 0,
        requestedQuantity: -1,
      }).ok,
    ).toBe(false);
  });

  it("rejects when nothing is left", () => {
    const r = checkDispenseBounds({
      rxQuantity: 30,
      rxRefills: 0,
      alreadyDispensedQuantity: 30,
      requestedQuantity: 1,
    });
    expect(r.ok).toBe(false);
  });
});

describe("validateBudtenderSignature", () => {
  it("accepts a valid signature payload", () => {
    expect(
      validateBudtenderSignature({
        budtenderName: "Sam Park",
        budtenderSignature: "data:image/png;base64,iVBORw0KGgo=",
      }),
    ).toEqual({ ok: true });
  });

  it("rejects missing name", () => {
    expect(
      validateBudtenderSignature({
        budtenderName: "",
        budtenderSignature: "data:image/png;base64,iVBORw0KGgo=",
      }).ok,
    ).toBe(false);
  });

  it("rejects missing signature", () => {
    expect(
      validateBudtenderSignature({
        budtenderName: "Sam Park",
        budtenderSignature: "",
      }).ok,
    ).toBe(false);
  });

  it("rejects placeholder signatures", () => {
    expect(
      validateBudtenderSignature({
        budtenderName: "Sam Park",
        budtenderSignature: "x",
      }).ok,
    ).toBe(false);
  });
});

describe("normalizePdmpFlags", () => {
  it("returns ['no_findings'] when nothing real surfaced", () => {
    expect(normalizePdmpFlags([])).toEqual(["no_findings"]);
    expect(normalizePdmpFlags(["no_findings"])).toEqual(["no_findings"]);
  });

  it("drops no_findings when real flags are present", () => {
    const result = normalizePdmpFlags(["no_findings", "early_refill"]);
    expect(result).toEqual(["early_refill"]);
  });

  it("de-duplicates", () => {
    expect(normalizePdmpFlags(["early_refill", "early_refill"])).toEqual([
      "early_refill",
    ]);
  });

  it("orders by severity (high first)", () => {
    const result = normalizePdmpFlags([
      "early_refill",
      "controlled_substance_combo",
      "multiple_prescribers",
    ]);
    expect(result).toEqual([
      "controlled_substance_combo",
      "multiple_prescribers",
      "early_refill",
    ]);
  });
});

describe("pdmpFlagLabel", () => {
  it("provides a human-readable label for every flag", () => {
    expect(pdmpFlagLabel("conflicting_scripts")).toContain("Conflicting");
    expect(pdmpFlagLabel("controlled_substance_combo")).toContain("Risky");
    expect(pdmpFlagLabel("no_findings")).toContain("No PDMP");
  });
});

describe("dispenseToMedication", () => {
  it("builds a PatientMedication payload from a dispense", () => {
    const med = dispenseToMedication({
      productName: "Solace 1500 CBD Tincture",
      productSku: "SLC-CBD-1500",
      quantity: 1,
      unit: "bottle",
      thcMgPerUnit: 0,
      cbdMgPerUnit: 1500,
      dispensedAt: new Date("2026-05-12T17:30:00Z"),
      doseInstructions: "0.5ml BID",
      prescriber: "Dr. Patel",
    });
    expect(med.name).toBe("Solace 1500 CBD Tincture");
    expect(med.dosage).toBe("0.5ml BID");
    expect(med.type).toBe("cannabis");
    expect(med.active).toBe(true);
    expect(med.notes).toContain("SLC-CBD-1500");
    expect(med.notes).toContain("CBD 1500mg/unit");
    expect(med.notes).toContain("2026-05-12");
  });

  it("falls back to quantity/unit when doseInstructions is missing", () => {
    const med = dispenseToMedication({
      productName: "Drift Indica Gummies 10mg",
      productSku: "DRIFT-IND-10",
      quantity: 30,
      unit: "gummies",
      dispensedAt: new Date("2026-05-12"),
    });
    expect(med.dosage).toBe("30 gummies");
    expect(med.prescriber).toBeNull();
  });
});
