import { describe, expect, it } from "vitest";

import {
  classifyAcknowledgment,
  normalizeClaimStatusInquiry,
} from "./clearinghouse";

describe("clearinghouse DB helpers", () => {
  it("classifies a rejected 999 as a rejected acknowledgment", () => {
    expect(
      classifyAcknowledgment({
        type: "999",
        status: "rejected",
        rejectedClaimCount: 0,
      }),
    ).toEqual({ status: "rejected", acceptedClaimCount: 0, rejectedClaimCount: 0 });
  });

  it("classifies mixed 277CA claim statuses as accepted_with_errors", () => {
    expect(
      classifyAcknowledgment({
        type: "277CA",
        status: "accepted",
        acceptedClaimCount: 3,
        rejectedClaimCount: 1,
      }),
    ).toEqual({
      status: "accepted_with_errors",
      acceptedClaimCount: 3,
      rejectedClaimCount: 1,
    });
  });

  it("normalizes claim status payloads for persistence", () => {
    const normalized = normalizeClaimStatusInquiry({
      claimId: "claim-1",
      organizationId: "org-1",
      payerName: "Acme Health",
      requestPayload: { controlNumber: "abc" },
      responsePayload: { status: "PENDING" },
      status: "pending",
    });

    expect(normalized).toMatchObject({
      claimId: "claim-1",
      organizationId: "org-1",
      payerName: "Acme Health",
      status: "pending",
    });
    expect(normalized.requestPayload).toEqual({ controlNumber: "abc" });
  });
});
