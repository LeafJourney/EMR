import { describe, expect, it } from "vitest";
import {
  applyProviderDecision,
  canTransition,
  evaluatePolicy,
  markSent,
  validatePatientSignature,
} from "./record-release-workflow";
import type { RecordReleaseRequest } from "@/lib/domain/record-release";

function release(over: Partial<RecordReleaseRequest> = {}): RecordReleaseRequest {
  return {
    id: "roi_1",
    patientId: "p_1",
    createdAt: "2026-05-01T08:00:00Z",
    updatedAt: "2026-05-01T08:00:00Z",
    status: "submitted",
    recipient: { fullName: "Dr. Smith", practice: "Pain Clinic of Orange County" },
    scope: "everything",
    categories: ["notes", "labs", "medications"],
    patientSignatureName: "Jane Doe",
    patientSignedAt: "2026-05-01T08:00:00Z",
    expiresAt: "2027-05-01T08:00:00Z",
    ...over,
  };
}

describe("evaluatePolicy", () => {
  it("buckets default categories correctly", () => {
    const p = evaluatePolicy(release({ categories: ["labs", "notes", "billing"] }));
    expect(p.autoReleasable).toEqual(["labs"]);
    expect(p.needsProviderReview).toEqual(expect.arrayContaining(["notes", "billing"]));
    expect(p.requiresReview).toBe(true);
    expect(p.hasForbidden).toBe(false);
  });

  it("honors per-practice policy overrides", () => {
    const p = evaluatePolicy(
      release({ categories: ["notes"] }),
      { notes: "forbidden" },
    );
    expect(p.forbidden).toEqual(["notes"]);
    expect(p.hasForbidden).toBe(true);
  });
});

describe("validatePatientSignature", () => {
  it("accepts a signature that matches the patient's legal name", () => {
    const v = validatePatientSignature(
      release({ patientSignatureName: "Jane Doe" }),
      "Jane Doe",
      new Date("2026-05-05T00:00:00Z"),
    );
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("rejects empty signatures", () => {
    const v = validatePatientSignature(
      release({ patientSignatureName: "" }),
      "Jane Doe",
      new Date("2026-05-05T00:00:00Z"),
    );
    expect(v.ok).toBe(false);
  });

  it("rejects when authorization has expired", () => {
    const v = validatePatientSignature(
      release({ expiresAt: "2026-04-01T00:00:00Z" }),
      "Jane Doe",
      new Date("2026-05-05T00:00:00Z"),
    );
    expect(v.errors).toContain("Authorization has expired.");
  });

  it("flags a signature that doesn't match the legal name", () => {
    const v = validatePatientSignature(
      release({ patientSignatureName: "John Smith" }),
      "Jane Doe",
      new Date("2026-05-05T00:00:00Z"),
    );
    expect(v.ok).toBe(false);
    expect(v.errors.join(" ")).toMatch(/does not match the legal name/);
  });

  it("accepts a signature with first-name match (initial-style)", () => {
    const v = validatePatientSignature(
      release({ patientSignatureName: "Jane" }),
      "Jane Marie Doe",
      new Date("2026-05-05T00:00:00Z"),
    );
    expect(v.ok).toBe(true);
  });
});

describe("canTransition", () => {
  it("permits submitted -> approved", () => {
    expect(canTransition("submitted", "approved")).toBe(true);
  });
  it("permits approved -> sent", () => {
    expect(canTransition("approved", "sent")).toBe(true);
  });
  it("blocks sent -> approved", () => {
    expect(canTransition("sent", "approved")).toBe(false);
  });
  it("blocks declined -> approved (terminal)", () => {
    expect(canTransition("declined", "approved")).toBe(false);
  });
  it("permits any -> revoked except from terminal states", () => {
    expect(canTransition("approved", "revoked")).toBe(true);
    expect(canTransition("declined", "revoked")).toBe(false);
  });
});

describe("applyProviderDecision (approve)", () => {
  it("transitions submitted to approved with provider signature", () => {
    const { next, audit } = applyProviderDecision({
      request: release(),
      providerUserId: "dr_1",
      providerSignatureName: "Dr. Helen Park",
      action: "approve",
    });
    expect(next.status).toBe("approved");
    expect(audit.action).toBe("record_release.approved");
    expect(audit.providerUserId).toBe("dr_1");
  });

  it("requires a provider signature on approval", () => {
    expect(() =>
      applyProviderDecision({
        request: release(),
        providerUserId: "dr_1",
        providerSignatureName: "",
        action: "approve",
      }),
    ).toThrow(/signature is required/i);
  });

  it("records categories withheld when only a subset is released", () => {
    const { next, audit } = applyProviderDecision({
      request: release({ categories: ["notes", "labs", "billing"] }),
      providerUserId: "dr_1",
      providerSignatureName: "Dr. Park",
      action: "approve",
      releaseCategories: ["labs"],
    });
    expect(next.categories).toEqual(["labs"]);
    expect(audit.categoriesReleased).toEqual(["labs"]);
    expect(audit.categoriesWithheld?.sort()).toEqual(["billing", "notes"]);
  });

  it("rejects approval when a forbidden category is in the request", () => {
    expect(() =>
      applyProviderDecision({
        request: release({ categories: ["notes"] }),
        providerUserId: "dr_1",
        providerSignatureName: "Dr. Park",
        action: "approve",
        policyOverrides: { notes: "forbidden" },
      }),
    ).toThrow(/forbidden/);
  });
});

describe("applyProviderDecision (decline)", () => {
  it("transitions to declined with required reason", () => {
    const { next, audit } = applyProviderDecision({
      request: release(),
      providerUserId: "dr_1",
      providerSignatureName: "Dr. Park",
      action: "decline",
      reason: "Recipient cannot be verified.",
    });
    expect(next.status).toBe("declined");
    expect(audit.action).toBe("record_release.declined");
    expect(audit.categoriesWithheld).toEqual(["notes", "labs", "medications"]);
  });

  it("requires a reason on decline", () => {
    expect(() =>
      applyProviderDecision({
        request: release(),
        providerUserId: "dr_1",
        providerSignatureName: "Dr. Park",
        action: "decline",
      }),
    ).toThrow(/reason is required/i);
  });
});

describe("markSent", () => {
  it("transitions approved -> sent", () => {
    const { next, audit } = markSent(release({ status: "approved" }), "dr_1");
    expect(next.status).toBe("sent");
    expect(audit.action).toBe("record_release.sent");
  });

  it("refuses to send when status is not approved", () => {
    expect(() => markSent(release({ status: "submitted" }), "dr_1")).toThrow(
      /Cannot mark sent/,
    );
  });
});
