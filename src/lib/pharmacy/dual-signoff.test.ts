import { describe, expect, it } from "vitest";
import {
  addSignoff,
  canApply,
  canSign,
  computeStatus,
  statusLabel,
  validateAfterPayload,
  type ChangeRequestState,
  type Signoff,
} from "./dual-signoff";

const at = (s: string) => new Date(s);

const pharmacistApprove: Signoff = {
  party: "pharmacist",
  decision: "approve",
  signedById: "user-pharm-1",
  signedName: "Pharmacist Park, PharmD",
  npi: "1234567890",
  signedAt: at("2026-05-12T10:00:00Z"),
};

const providerApprove: Signoff = {
  party: "provider",
  decision: "approve",
  signedById: "user-prov-1",
  signedName: "Dr. Patel, MD",
  signedAt: at("2026-05-12T11:00:00Z"),
};

const pharmacistReject: Signoff = {
  party: "pharmacist",
  decision: "reject",
  signedById: "user-pharm-1",
  signedName: "Pharmacist Park, PharmD",
  comments: "Dose exceeds max for renal function.",
  signedAt: at("2026-05-12T10:00:00Z"),
};

describe("computeStatus", () => {
  it("returns 'proposed' for zero signoffs", () => {
    expect(computeStatus([])).toBe("proposed");
  });

  it("reflects single pharmacist approval", () => {
    expect(computeStatus([pharmacistApprove])).toBe("pharmacist_signed");
  });

  it("reflects single provider approval", () => {
    expect(computeStatus([providerApprove])).toBe("provider_signed");
  });

  it("flips to fully_signed when both parties approve regardless of order", () => {
    expect(computeStatus([pharmacistApprove, providerApprove])).toBe(
      "fully_signed",
    );
    expect(computeStatus([providerApprove, pharmacistApprove])).toBe(
      "fully_signed",
    );
  });

  it("any rejection trumps approvals and yields rejected", () => {
    expect(computeStatus([pharmacistReject])).toBe("rejected");
    expect(computeStatus([providerApprove, pharmacistReject])).toBe("rejected");
  });
});

describe("canSign", () => {
  it("allows a fresh signature from each party", () => {
    expect(canSign([], "pharmacist")).toEqual({ ok: true });
    expect(canSign([pharmacistApprove], "provider")).toEqual({ ok: true });
  });

  it("blocks a double signature from the same party", () => {
    const result = canSign([pharmacistApprove], "pharmacist");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("pharmacist");
    }
  });
});

describe("canApply", () => {
  const baseApplied: ChangeRequestState = {
    status: "applied",
    signoffs: [pharmacistApprove, providerApprove],
    appliedAt: at("2026-05-12T12:00:00Z"),
  };

  it("returns true ONLY for fully_signed + not-yet-applied", () => {
    const fully: ChangeRequestState = {
      status: "fully_signed",
      signoffs: [pharmacistApprove, providerApprove],
      appliedAt: null,
    };
    expect(canApply(fully)).toBe(true);
  });

  it("returns false once applied", () => {
    expect(canApply(baseApplied)).toBe(false);
  });

  it("returns false for partial sign-off states", () => {
    expect(
      canApply({
        status: "pharmacist_signed",
        signoffs: [pharmacistApprove],
        appliedAt: null,
      }),
    ).toBe(false);
    expect(
      canApply({
        status: "provider_signed",
        signoffs: [providerApprove],
        appliedAt: null,
      }),
    ).toBe(false);
  });

  it("returns false for rejected or withdrawn changes", () => {
    expect(
      canApply({ status: "rejected", signoffs: [pharmacistReject], appliedAt: null }),
    ).toBe(false);
    expect(
      canApply({ status: "withdrawn", signoffs: [], appliedAt: null }),
    ).toBe(false);
  });
});

describe("addSignoff", () => {
  it("appends a pharmacist signature and moves to pharmacist_signed", () => {
    const result = addSignoff(
      { status: "proposed", signoffs: [], appliedAt: null },
      pharmacistApprove,
    );
    expect(result.nextStatus).toBe("pharmacist_signed");
    expect(result.signoffs).toEqual([pharmacistApprove]);
  });

  it("moves to fully_signed when the second party approves", () => {
    const result = addSignoff(
      {
        status: "pharmacist_signed",
        signoffs: [pharmacistApprove],
        appliedAt: null,
      },
      providerApprove,
    );
    expect(result.nextStatus).toBe("fully_signed");
    expect(result.signoffs).toHaveLength(2);
  });

  it("refuses to sign when the request has already been applied", () => {
    expect(() =>
      addSignoff(
        {
          status: "applied",
          signoffs: [pharmacistApprove, providerApprove],
          appliedAt: at("2026-05-12T12:00:00Z"),
        },
        pharmacistApprove,
      ),
    ).toThrow(/already been applied/);
  });

  it("refuses double signature from the same party", () => {
    expect(() =>
      addSignoff(
        {
          status: "pharmacist_signed",
          signoffs: [pharmacistApprove],
          appliedAt: null,
        },
        { ...pharmacistApprove, signedById: "other" },
      ),
    ).toThrow(/already been signed/);
  });

  it("refuses to sign a rejected request", () => {
    expect(() =>
      addSignoff(
        {
          status: "rejected",
          signoffs: [pharmacistReject],
          appliedAt: null,
        },
        providerApprove,
      ),
    ).toThrow(/rejected/);
  });
});

describe("statusLabel", () => {
  it("returns human-readable labels for every state", () => {
    expect(statusLabel("proposed")).toContain("waiting");
    expect(statusLabel("fully_signed")).toContain("ready to apply");
    expect(statusLabel("rejected")).toContain("will not be applied");
    expect(statusLabel("applied")).toContain("Applied");
  });
});

describe("validateAfterPayload", () => {
  it("accepts a minimal valid payload", () => {
    expect(
      validateAfterPayload({ active: true, name: "Cetirizine 10mg" }),
    ).toMatchObject({ active: true, name: "Cetirizine 10mg" });
  });

  it("passes through optional fields", () => {
    expect(
      validateAfterPayload({
        active: false,
        name: "Warfarin",
        discontinuedReason: "Replaced by apixaban",
        dosage: "5mg",
      }),
    ).toMatchObject({
      active: false,
      discontinuedReason: "Replaced by apixaban",
      dosage: "5mg",
    });
  });

  it("rejects payloads missing required fields", () => {
    expect(() => validateAfterPayload(null)).toThrow(/must be an object/);
    expect(() => validateAfterPayload({ name: "x" })).toThrow(/active/);
    expect(() => validateAfterPayload({ active: true })).toThrow(/name/);
    expect(() => validateAfterPayload({ active: true, name: "" })).toThrow(
      /non-empty/,
    );
  });

  it("ignores unknown fields rather than blowing up", () => {
    const result = validateAfterPayload({
      active: true,
      name: "Aspirin 81mg",
      unknownField: "ignored",
    });
    expect(result.name).toBe("Aspirin 81mg");
    expect("unknownField" in result).toBe(false);
  });
});
