/**
 * EMR-082: Patient-initiated medical record release.
 *
 * Patient authorizes the practice to send their records to another doctor
 * or facility. This module is the typed contract; the v1 storage layer is
 * client-side (sessionStorage) so the scaffold can be tested end-to-end
 * without a Prisma migration. When the persistence layer lands, swap the
 * loader/saver implementations under `src/lib/portal/record-release-store`
 * for server actions; the form and review UIs do not need to change.
 *
 * Real transmission (Direct Trust messaging, FHIR Bulk Data, signed PDFs,
 * etc.) is out of scope for the scaffold and intentionally not modeled here.
 */

export type RecordReleaseScope =
  | "everything"
  | "date_range"
  | "encounter_types";

export type RecordCategory =
  | "notes"
  | "labs"
  | "imaging"
  | "medications"
  | "immunizations"
  | "problem_list"
  | "allergies"
  | "billing";

export const RECORD_CATEGORY_LABELS: Record<RecordCategory, string> = {
  notes: "Visit notes",
  labs: "Lab results",
  imaging: "Imaging reports",
  medications: "Medications",
  immunizations: "Immunizations",
  problem_list: "Problem list",
  allergies: "Allergies",
  billing: "Billing summary",
};

export type RecordReleaseStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "sent"
  | "declined"
  | "revoked";

export const STATUS_LABELS: Record<RecordReleaseStatus, string> = {
  draft: "Draft",
  submitted: "Awaiting review",
  approved: "Approved — preparing",
  sent: "Sent",
  declined: "Declined by practice",
  revoked: "Revoked by patient",
};

export interface Recipient {
  fullName: string;
  practice?: string;
  email?: string;
  fax?: string;
  address?: string;
}

export interface RecordReleaseRequest {
  id: string;
  patientId: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
  status: RecordReleaseStatus;

  recipient: Recipient;

  // Scope
  scope: RecordReleaseScope;
  categories: RecordCategory[];
  dateFrom?: string; // ISO date
  dateTo?: string; // ISO date

  // Authorization
  patientSignatureName: string; // typed name as e-signature
  patientSignedAt: string; // ISO
  expiresAt: string; // ISO — typically 12 months from submission
  reason?: string;

  // Audit hooks (populated when wired to AuditLog model)
  auditLogIds?: string[];
}

export interface NewRecordReleaseInput {
  recipient: Recipient;
  scope: RecordReleaseScope;
  categories: RecordCategory[];
  dateFrom?: string;
  dateTo?: string;
  patientSignatureName: string;
  reason?: string;
  /** Months until the authorization expires. Defaults to 12. */
  validForMonths?: number;
}

/** A reasonable default authorization window (HIPAA standard practice). */
export const DEFAULT_AUTHORIZATION_MONTHS = 12;

export function buildReleaseRequest(
  patientId: string,
  input: NewRecordReleaseInput,
): RecordReleaseRequest {
  const now = new Date();
  const months = input.validForMonths ?? DEFAULT_AUTHORIZATION_MONTHS;
  const expires = new Date(now);
  expires.setMonth(expires.getMonth() + months);

  return {
    id: cryptoRandomId(),
    patientId,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: "submitted",
    recipient: input.recipient,
    scope: input.scope,
    categories: input.categories,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    patientSignatureName: input.patientSignatureName,
    patientSignedAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    reason: input.reason,
  };
}

/** Shape of a persisted RecordReleaseRequest row (matches the Prisma model
 *  structurally so it can be mapped without importing Prisma here). */
export interface RecordReleaseRow {
  id: string;
  patientId: string;
  status: string;
  recipientName: string;
  recipientPractice: string | null;
  recipientEmail: string | null;
  recipientFax: string | null;
  recipientAddress: string | null;
  scope: string;
  categories: string[];
  dateFrom: Date | null;
  dateTo: Date | null;
  patientSignatureName: string;
  patientSignedAt: Date;
  expiresAt: Date;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Map a persisted row to the UI-facing RecordReleaseRequest (ISO dates, nested
 *  recipient). */
export function recordReleaseFromRow(r: RecordReleaseRow): RecordReleaseRequest {
  return {
    id: r.id,
    patientId: r.patientId,
    status: r.status as RecordReleaseStatus,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    recipient: {
      fullName: r.recipientName,
      practice: r.recipientPractice ?? undefined,
      email: r.recipientEmail ?? undefined,
      fax: r.recipientFax ?? undefined,
      address: r.recipientAddress ?? undefined,
    },
    scope: r.scope as RecordReleaseScope,
    categories: r.categories as RecordCategory[],
    dateFrom: r.dateFrom?.toISOString(),
    dateTo: r.dateTo?.toISOString(),
    patientSignatureName: r.patientSignatureName,
    patientSignedAt: r.patientSignedAt.toISOString(),
    expiresAt: r.expiresAt.toISOString(),
    reason: r.reason ?? undefined,
  };
}

function cryptoRandomId(): string {
  // crypto.randomUUID is available in modern browsers and Node ≥ 18.
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  // Fallback for older environments — collision risk is acceptable here
  // because the scaffold scope is a single user's session.
  return `roi_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
