export type ClearinghouseAckInput = {
  type: "999" | "277CA";
  status: "accepted" | "accepted_with_errors" | "rejected" | "pending" | "unknown";
  acceptedClaimCount?: number;
  rejectedClaimCount?: number;
};

export type ClearinghouseAckSummary = {
  status: "accepted" | "accepted_with_errors" | "rejected" | "pending" | "unknown";
  acceptedClaimCount: number;
  rejectedClaimCount: number;
};

export function classifyAcknowledgment(
  input: ClearinghouseAckInput,
): ClearinghouseAckSummary {
  const acceptedClaimCount = input.acceptedClaimCount ?? 0;
  const rejectedClaimCount = input.rejectedClaimCount ?? 0;

  if (input.status === "rejected") {
    return { status: "rejected", acceptedClaimCount, rejectedClaimCount };
  }

  if (input.type === "277CA" && rejectedClaimCount > 0) {
    return {
      status: acceptedClaimCount > 0 ? "accepted_with_errors" : "rejected",
      acceptedClaimCount,
      rejectedClaimCount,
    };
  }

  return {
    status: input.status,
    acceptedClaimCount,
    rejectedClaimCount,
  };
}

export type ClaimStatusInquiryInput = {
  claimId: string;
  organizationId: string;
  payerName: string;
  status: "pending" | "accepted" | "rejected" | "paid" | "denied" | "unknown";
  requestPayload?: unknown;
  responsePayload?: unknown;
  requestedAt?: Date;
  respondedAt?: Date | null;
};

export function normalizeClaimStatusInquiry(input: ClaimStatusInquiryInput) {
  return {
    claimId: input.claimId,
    organizationId: input.organizationId,
    payerName: input.payerName.trim(),
    status: input.status,
    requestPayload: input.requestPayload ?? {},
    responsePayload: input.responsePayload ?? null,
    requestedAt: input.requestedAt ?? new Date(),
    respondedAt: input.respondedAt ?? null,
  };
}
