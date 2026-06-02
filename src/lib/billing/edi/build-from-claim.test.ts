import { describe, expect, it } from "vitest";
import type {
  AdjudicationResult,
  Claim,
  Organization,
  Patient,
} from "@prisma/client";
import { buildClaimEdi, type ClaimContext } from "./build-from-claim";

// EMR-216 — projecting a Prisma claim into a real 837P. These exercise the
// gaps that used to be V1 placeholders: the subscriber member ID (read from
// Coverage) and the secondary primary-payer name + claim-level CAS.

const ORG = {
  id: "org1",
  name: "Greenpath Wellness",
  billingNpi: "1234567893", // CMS reference NPI (valid Luhn)
  taxId: null,
  billingAddress: { line1: "1 Main St", city: "Denver", state: "CO", postalCode: "80202" },
  payToAddress: null,
} as unknown as Organization;

const PATIENT = {
  id: "pat_internal_id",
  firstName: "Jane",
  lastName: "Doe",
  dateOfBirth: new Date("1990-01-01"),
  addressLine1: "2 Oak St",
  addressLine2: null,
  city: "Denver",
  state: "CO",
  postalCode: "80203",
} as unknown as Patient;

const CLAIM = {
  id: "clm1",
  payerName: "Aetna",
  payerId: "60054",
  billedAmountCents: 15000,
  placeOfService: "11",
  frequencyCode: "1",
  cptCodes: [{ code: "99213", chargeAmount: 150, units: 1, modifiers: [] }],
  icd10Codes: [{ code: "M54.50" }],
  serviceDate: new Date("2026-05-01"),
  priorAuthNumber: null,
  claimNumber: "CLM-1",
  notes: null,
} as unknown as Claim;

function ctx(over: Partial<ClaimContext> = {}): ClaimContext {
  return {
    claim: CLAIM,
    patient: PATIENT,
    organization: ORG,
    provider: null,
    renderingName: { firstName: "Pat", lastName: "Provider" },
    controlNumbers: { isaControlNumber: 1, gsControlNumber: 1, stControlNumber: "0001" },
    ...over,
  };
}

describe("buildClaimEdi — subscriber member ID (EMR-216)", () => {
  it("emits the payer member ID from Coverage, not the patient row id", () => {
    const { built } = buildClaimEdi(ctx({ coverage: { memberId: "W123456789" } }));
    expect(built.payload).toContain("MI*W123456789");
    expect(built.payload).not.toContain("pat_internal_id");
  });

  it("falls back to the patient id only when no Coverage is on file", () => {
    const { built } = buildClaimEdi(ctx({ coverage: null }));
    expect(built.payload).toContain("pat_internal_id");
  });
});

describe("buildClaimEdi — secondary primary payer (EMR-216 / EMR-219)", () => {
  const ADJ = {
    totalAllowedCents: 12000,
    totalPaidCents: 9000,
    eraDate: new Date("2026-05-10"),
    checkNumber: "CHK99",
    lineDetails: [],
  } as unknown as AdjudicationResult;

  it("emits the real primary payer name + claim-level CAS in Loop 2320", () => {
    const { built } = buildClaimEdi(
      ctx({
        coverage: { memberId: "W123456789" },
        secondary: {
          primaryAdjudication: ADJ,
          primarySubmission: { id: "sub1", ediResponse: null },
          primaryPayerName: "Medicare",
          primaryPayerId: "MC123",
          primaryClaimCas: [{ groupCode: "CO", reasonCode: "45", amountCents: 3000 }],
        },
      }),
    );
    expect(built.payload).toContain("Medicare");
    expect(built.payload).not.toContain("PRIMARY PAYER");
    expect(built.payload).toContain("CAS*CO*45");
  });

  it("only falls back to the placeholder payer name when unknown", () => {
    const { built } = buildClaimEdi(
      ctx({
        coverage: { memberId: "W123456789" },
        secondary: {
          primaryAdjudication: ADJ,
          primarySubmission: { id: "sub1", ediResponse: null },
        },
      }),
    );
    expect(built.payload).toContain("PRIMARY PAYER");
  });
});
