/**
 * EMR-082 — Provider-side workflow for record-release requests.
 *
 * The patient-facing form (see `src/components/portal/record-release-form.tsx`)
 * captures recipient, scope, e-signature, and submits a request. The
 * provider review screen needs to:
 *
 *   1. Verify the patient e-signature is valid and not expired.
 *   2. Apply the practice's release-of-information policy: which
 *      categories are released without manual review, which require
 *      provider sign-off, which are forbidden.
 *   3. Drive the state machine: submitted → approved → sent  OR
 *      submitted → declined  OR  any → revoked.
 *   4. Produce a structured audit payload for AuditLog.
 *
 * Pure TS — the storage layer remains pluggable.
 */

import {
  RECORD_CATEGORY_LABELS,
  type RecordCategory,
  type RecordReleaseRequest,
  type RecordReleaseStatus,
} from "@/lib/domain/record-release";

export type ReviewPolicy = "auto_release" | "needs_provider_review" | "forbidden";

/**
 * Default ROI policy. Most categories release automatically once the
 * patient has signed; mental-health-adjacent categories and billing
 * records require provider review; psychotherapy process notes are
 * never released through the standard ROI surface.
 */
export const DEFAULT_CATEGORY_POLICY: Record<RecordCategory, ReviewPolicy> = {
  notes: "needs_provider_review",
  labs: "auto_release",
  imaging: "auto_release",
  medications: "auto_release",
  immunizations: "auto_release",
  problem_list: "auto_release",
  allergies: "auto_release",
  billing: "needs_provider_review",
};

export interface PolicyDecision {
  categories: Array<{
    category: RecordCategory;
    label: string;
    policy: ReviewPolicy;
  }>;
  /** True iff any category requires provider sign-off before sending. */
  requiresReview: boolean;
  /** True iff any category is forbidden under the policy. */
  hasForbidden: boolean;
  /** Categories the provider may release without further review. */
  autoReleasable: RecordCategory[];
  /** Categories that need provider sign-off. */
  needsProviderReview: RecordCategory[];
  /** Forbidden categories — must be dropped before sending. */
  forbidden: RecordCategory[];
}

export function evaluatePolicy(
  request: Pick<RecordReleaseRequest, "categories">,
  overrides: Partial<Record<RecordCategory, ReviewPolicy>> = {},
): PolicyDecision {
  const policy = { ...DEFAULT_CATEGORY_POLICY, ...overrides };
  const categories = request.categories.map((c) => ({
    category: c,
    label: RECORD_CATEGORY_LABELS[c],
    policy: policy[c],
  }));
  const autoReleasable = categories
    .filter((c) => c.policy === "auto_release")
    .map((c) => c.category);
  const needsProviderReview = categories
    .filter((c) => c.policy === "needs_provider_review")
    .map((c) => c.category);
  const forbidden = categories
    .filter((c) => c.policy === "forbidden")
    .map((c) => c.category);
  return {
    categories,
    autoReleasable,
    needsProviderReview,
    forbidden,
    requiresReview: needsProviderReview.length > 0,
    hasForbidden: forbidden.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Patient e-signature validation
// ---------------------------------------------------------------------------

export interface SignatureValidation {
  ok: boolean;
  errors: string[];
}

/** Permissive normalization for name-vs-name comparison. */
function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function validatePatientSignature(
  request: Pick<
    RecordReleaseRequest,
    "patientSignatureName" | "patientSignedAt" | "expiresAt"
  >,
  patientLegalName: string,
  now: Date = new Date(),
): SignatureValidation {
  const errors: string[] = [];
  if (!request.patientSignatureName?.trim()) {
    errors.push("Patient signature is missing.");
  }
  if (!request.patientSignedAt) {
    errors.push("Signature timestamp is missing.");
  }
  if (request.expiresAt && new Date(request.expiresAt).getTime() < now.getTime()) {
    errors.push("Authorization has expired.");
  }
  if (request.patientSignatureName && patientLegalName) {
    const sigTokens = new Set(
      normalizeName(request.patientSignatureName).split(" "),
    );
    const nameTokens = new Set(normalizeName(patientLegalName).split(" "));
    let overlap = 0;
    for (const t of sigTokens) {
      if (t.length >= 2 && nameTokens.has(t)) overlap += 1;
    }
    if (overlap === 0) {
      errors.push(
        "Patient signature does not match the legal name on file. Confirm identity before approving.",
      );
    }
  }
  return { ok: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<RecordReleaseStatus, RecordReleaseStatus[]> = {
  draft: ["submitted", "revoked"],
  submitted: ["approved", "declined", "revoked"],
  approved: ["sent", "declined", "revoked"],
  sent: ["revoked"],
  declined: [],
  revoked: [],
};

export function canTransition(
  from: RecordReleaseStatus,
  to: RecordReleaseStatus,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export interface ProviderDecisionInput {
  request: RecordReleaseRequest;
  /** Provider performing the action. */
  providerUserId: string;
  providerSignatureName: string;
  /** "approve" releases all approved categories; "decline" rejects. */
  action: "approve" | "decline";
  /** Subset to release. Defaults to all requested categories. */
  releaseCategories?: RecordCategory[];
  /** Free-text decision reason (required on decline; optional on approve). */
  reason?: string;
  /** Optional policy overrides applied for this practice. */
  policyOverrides?: Partial<Record<RecordCategory, ReviewPolicy>>;
}

export interface ProviderDecisionResult {
  next: RecordReleaseRequest;
  audit: RecordReleaseAuditPayload;
}

export interface RecordReleaseAuditPayload {
  action:
    | "record_release.submitted"
    | "record_release.approved"
    | "record_release.declined"
    | "record_release.sent"
    | "record_release.revoked";
  at: string;
  releaseId: string;
  patientId: string;
  providerUserId?: string;
  recipientName: string;
  scope: RecordReleaseRequest["scope"];
  categoriesReleased?: RecordCategory[];
  categoriesWithheld?: RecordCategory[];
  reason?: string;
}

/**
 * Apply a provider review decision and return the next request + audit.
 * Throws when the transition would violate the state machine or policy.
 */
export function applyProviderDecision(
  input: ProviderDecisionInput,
): ProviderDecisionResult {
  const { request, action, providerUserId, providerSignatureName, reason } = input;
  if (action === "decline") {
    if (!canTransition(request.status, "declined")) {
      throw new Error(
        `Cannot decline request in status "${request.status}".`,
      );
    }
    if (!reason?.trim()) {
      throw new Error("A reason is required to decline a record release.");
    }
    const next: RecordReleaseRequest = {
      ...request,
      status: "declined",
      updatedAt: new Date().toISOString(),
      reason,
    };
    return {
      next,
      audit: {
        action: "record_release.declined",
        at: next.updatedAt,
        releaseId: request.id,
        patientId: request.patientId,
        providerUserId,
        recipientName: request.recipient.fullName,
        scope: request.scope,
        categoriesWithheld: request.categories,
        reason,
      },
    };
  }

  // action === "approve"
  if (!canTransition(request.status, "approved")) {
    throw new Error(
      `Cannot approve request in status "${request.status}".`,
    );
  }
  if (!providerSignatureName.trim()) {
    throw new Error("Provider signature is required to approve a release.");
  }

  const policy = evaluatePolicy(request, input.policyOverrides);
  if (policy.hasForbidden) {
    throw new Error(
      `Cannot approve: requested categories include forbidden items (${policy.forbidden.join(", ")}). Drop them or decline the request.`,
    );
  }

  const released =
    input.releaseCategories ?? request.categories.filter((c) =>
      [...policy.autoReleasable, ...policy.needsProviderReview].includes(c),
    );
  // Any requested-but-not-released categories are recorded as withheld.
  const withheld = request.categories.filter((c) => !released.includes(c));

  const next: RecordReleaseRequest = {
    ...request,
    status: "approved",
    categories: released,
    updatedAt: new Date().toISOString(),
    reason: reason ?? request.reason,
  };

  return {
    next,
    audit: {
      action: "record_release.approved",
      at: next.updatedAt,
      releaseId: request.id,
      patientId: request.patientId,
      providerUserId,
      recipientName: request.recipient.fullName,
      scope: request.scope,
      categoriesReleased: released,
      categoriesWithheld: withheld.length > 0 ? withheld : undefined,
      reason,
    },
  };
}

/**
 * Mark an approved release as sent. The actual transmission (Direct Trust,
 * fax, encrypted email) is out of band — this just records that the
 * artifact left our system.
 */
export function markSent(
  request: RecordReleaseRequest,
  providerUserId: string,
): ProviderDecisionResult {
  if (!canTransition(request.status, "sent")) {
    throw new Error(
      `Cannot mark sent from status "${request.status}".`,
    );
  }
  const next: RecordReleaseRequest = {
    ...request,
    status: "sent",
    updatedAt: new Date().toISOString(),
  };
  return {
    next,
    audit: {
      action: "record_release.sent",
      at: next.updatedAt,
      releaseId: request.id,
      patientId: request.patientId,
      providerUserId,
      recipientName: request.recipient.fullName,
      scope: request.scope,
      categoriesReleased: request.categories,
    },
  };
}
