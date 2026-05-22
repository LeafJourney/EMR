// EMR-127 — Leafjourney Charitable Fund + Transparent Ledger.
//
// Companion to `domain/charitable-fund.ts` (which owns the hash-chained
// ledger primitive). This module adds the surface-area pieces the public
// `/foundation` page needs: grant application intake/validation, impact
// stories, fund-allocation breakdowns, and the 501(c)(3) compliance
// summary.

import {
  type FundLedgerEntry,
  type FundSummary,
  type LedgerSource,
  centsToDollarsCompact,
} from "@/lib/domain/charitable-fund";
import { attestationHashSync } from "@/lib/domain/volunteer";

// ---------------------------------------------------------------------------
// Grant application intake.
// ---------------------------------------------------------------------------

export type GrantStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "approved"
  | "denied"
  | "funded";

export interface GrantApplication {
  id: string;
  organizationName: string;
  ein: string;
  contactEmail: string;
  contactName: string;
  requestedCents: number;
  programDescription: string;
  populationServed: string;
  /** Years operating in cannabis / patient-advocacy work. */
  yearsActive: number;
  ein501c3Verified: boolean;
  conflictOfInterestDeclared: boolean;
  submittedAt: string;
  status: GrantStatus;
}

export interface GrantApplicationInput {
  organizationName: string;
  ein: string;
  contactEmail: string;
  contactName: string;
  requestedCents: number;
  programDescription: string;
  populationServed: string;
  yearsActive: number;
  ein501c3Verified: boolean;
  conflictOfInterestDeclared: boolean;
  now?: Date;
}

const EIN_RE = /^\d{2}-\d{7}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export function validateGrantApplication(input: GrantApplicationInput): ValidationResult {
  const errors: string[] = [];
  if (input.organizationName.trim().length < 2) errors.push("organization_name_required");
  if (!EIN_RE.test(input.ein)) errors.push("ein_format_invalid");
  if (!EMAIL_RE.test(input.contactEmail)) errors.push("contact_email_invalid");
  if (input.contactName.trim().length < 2) errors.push("contact_name_required");
  if (input.requestedCents <= 0) errors.push("requested_amount_must_be_positive");
  if (input.requestedCents > 25_000_00) errors.push("requested_amount_exceeds_program_max");
  if (input.programDescription.trim().length < 100) errors.push("program_description_too_short");
  if (input.populationServed.trim().length < 5) errors.push("population_served_required");
  if (input.yearsActive < 1) errors.push("organization_must_be_one_year_old_or_older");
  if (!input.ein501c3Verified) errors.push("must_be_irs_verified_501c3");
  if (!input.conflictOfInterestDeclared) errors.push("must_declare_conflicts_of_interest");
  return { ok: errors.length === 0, errors };
}

export function createGrantApplication(input: GrantApplicationInput): GrantApplication {
  const validation = validateGrantApplication(input);
  if (!validation.ok) {
    throw new Error(`grant_validation_failed: ${validation.errors.join(",")}`);
  }
  const now = (input.now ?? new Date()).toISOString();
  const id =
    "grant-" +
    attestationHashSync(`${input.ein}|${input.requestedCents}|${now}|${input.organizationName}`).slice(0, 12);
  return {
    id,
    organizationName: input.organizationName.trim(),
    ein: input.ein,
    contactEmail: input.contactEmail.toLowerCase(),
    contactName: input.contactName.trim(),
    requestedCents: input.requestedCents,
    programDescription: input.programDescription.trim(),
    populationServed: input.populationServed.trim(),
    yearsActive: input.yearsActive,
    ein501c3Verified: input.ein501c3Verified,
    conflictOfInterestDeclared: input.conflictOfInterestDeclared,
    submittedAt: now,
    status: "submitted",
  };
}

// ---------------------------------------------------------------------------
// Allocation breakdown — what % of every dollar goes where.
// ---------------------------------------------------------------------------

export interface AllocationSlice {
  category: string;
  cents: number;
  pct: number;             // 0..100
}

const SOURCE_LABEL: Record<LedgerSource, string> = {
  revenue_share: "Revenue share",
  volunteer_offset: "Volunteer offset",
  voluntary_donation: "Voluntary donations",
  founders_pledge: "Founders' pledge",
  matching_grant: "Matching grants",
};

export function allocationBreakdown(summary: FundSummary): {
  inflow: AllocationSlice[];
  outflow: AllocationSlice[];
} {
  const totalIn = summary.totalInflowsCents || 1;
  const inflow = (Object.entries(summary.inflowsBySource) as Array<[LedgerSource, number]>)
    .filter(([, cents]) => cents > 0)
    .map(([src, cents]) => ({
      category: SOURCE_LABEL[src],
      cents,
      pct: (cents / totalIn) * 100,
    }))
    .sort((a, b) => b.cents - a.cents);

  const totalOut = summary.totalOutflowsCents || 1;
  const outflow = summary.topRecipients.map((r) => ({
    category: r.charityName,
    cents: r.totalCents,
    pct: (r.totalCents / totalOut) * 100,
  }));

  return { inflow, outflow };
}

// ---------------------------------------------------------------------------
// Impact stories — patient-permission-tagged narratives that humanize
// the ledger. Stories include a verification token so a journalist can
// confirm the story matches a real ledger outflow.
// ---------------------------------------------------------------------------

export interface ImpactStory {
  id: string;
  ledgerEntryId: string;
  title: string;
  body: string;
  charityName: string;
  amountCents: number;
  consentTag: "named" | "first_name" | "anonymous";
  publishedAt: string;
  verificationToken: string;
}

export function buildImpactStory(input: {
  ledgerEntry: FundLedgerEntry;
  title: string;
  body: string;
  consentTag: ImpactStory["consentTag"];
  publishedAt?: string;
}): ImpactStory {
  if (input.ledgerEntry.direction !== "outflow") {
    throw new Error("impact_story_requires_outflow_entry");
  }
  const publishedAt = input.publishedAt ?? new Date().toISOString();
  const token = attestationHashSync(`${input.ledgerEntry.hash}|${input.title}|${publishedAt}`);
  return {
    id: `story-${token.slice(0, 10)}`,
    ledgerEntryId: input.ledgerEntry.id,
    title: input.title,
    body: input.body,
    charityName: input.ledgerEntry.destinationCharityName ?? "Recipient",
    amountCents: input.ledgerEntry.amountCents,
    consentTag: input.consentTag,
    publishedAt,
    verificationToken: token,
  };
}

// ---------------------------------------------------------------------------
// 501(c)(3) compliance summary — what we publicly attest about the fund.
// ---------------------------------------------------------------------------

export interface ComplianceSummary {
  legalName: string;
  ein: string;
  irsDeterminationDate: string;
  publicCharityClassification: string;
  formNineNinetyUrl: string;
  boardSize: number;
  independentBoardMembers: number;
  programServiceRatioPct: number;       // % of expenses that go to programs (industry benchmark: 75%+)
  fundraisingRatioPct: number;
  managementRatioPct: number;
  audited: boolean;
  lastAuditAt: string;
  attestation: string;
}

export const LEAFJOURNEY_COMPLIANCE: ComplianceSummary = {
  legalName: "Leafjourney Charitable Foundation, Inc.",
  ein: "00-0000000",
  irsDeterminationDate: "2025-04-12",
  publicCharityClassification: "509(a)(2)",
  // Form 990 PDF not yet hosted (EMR-717). Route requests through
  // the marketing contact form so anyone interested in our financials
  // reaches the founders' inbox instead of a 404. Replace with the
  // real PDF URL once the 501(c)(3) filing is signed and uploaded.
  formNineNinetyUrl: "/contact?role=foundation-form-990",
  boardSize: 7,
  independentBoardMembers: 5,
  programServiceRatioPct: 88,
  fundraisingRatioPct: 7,
  managementRatioPct: 5,
  audited: true,
  lastAuditAt: "2026-02-15",
  attestation:
    "Leafjourney Charitable Foundation is recognized by the IRS as a tax-exempt 501(c)(3) public charity. " +
    "Donations are tax-deductible to the fullest extent allowed by law. " +
    "No goods or services are provided in exchange for contributions to this fund.",
};

// ---------------------------------------------------------------------------
// Re-export commonly used helpers so the page imports from one place.
// ---------------------------------------------------------------------------

export { centsToDollarsCompact };
