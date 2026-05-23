// EMR-786 — Granular role-based access controls + chart privacy.
//
// `roles.ts` answers "can this role enter this URL prefix?" — a coarse
// route-level gate driven by middleware and layouts. This module answers
// the much finer question every server action actually needs to ask:
// "given this user's roles, can they see / edit *this* resource on *this*
// chart?"
//
// The matrix below is the source of truth. Layouts and server actions
// MUST call `requirePermission()` or `assertChartAccess()` before
// returning PHI, never inline `user.roles.includes(...)` ad-hoc.
//
// Two layers stack:
//
//   1. ROLE PERMISSIONS — what a role can do globally. Front-office can
//      read demographics + billing; back-office can read clinical notes
//      but not edit them; mid-levels can edit notes but some sections
//      need a clinician co-signature.
//
//   2. CHART PRIVACY — a per-patient override. When `chartRestricted`
//      is true on the Patient row, only the User IDs in
//      `restrictedProviderIds` (plus practice_owner / clinician roles
//      who own the chart) may read clinical data, regardless of what
//      the matrix above grants. Used for celebrity charts, behavioral
//      health, domestic violence, and any patient-driven privacy
//      preference.

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import type { AuthedUser } from "@/lib/auth/session";

/* ── Permission keys ────────────────────────────────────────────── */

/**
 * Every permission gate in the EMR maps to one of these keys. Add new
 * keys as you grow new surfaces — DO NOT branch on `user.roles` directly
 * in server actions.
 */
export type Permission =
  // Patient demographics: name, DOB, address, phone, email, insurance.
  | "patient.demographics.read"
  | "patient.demographics.edit"
  // Billing: claims, statements, payments, fee schedules, RCM queues.
  | "billing.read"
  | "billing.edit"
  // Clinical notes (SOAP, progress, telehealth, etc.).
  | "notes.read"
  | "notes.edit"
  // Clinical history: problems list, encounter history, prior diagnoses.
  | "clinical_history.read"
  // Sensitive diagnoses (behavioral health, substance use, HIV, etc.).
  // The data-classification tier above `clinical_history.read`.
  | "sensitive_diagnoses.read"
  // Prescriptions / e-Rx / medication management.
  | "prescriptions.read"
  | "prescriptions.write"
  // Lab orders + results review.
  | "labs.read"
  | "labs.sign"
  // Co-signature workflow — a mid-level provider needs an attesting
  // clinician on certain encounter / sensitive note types before the
  // chart leaves draft.
  | "notes.cosign_required"
  // Manage who is on the chart's restricted-access list.
  | "chart.privacy.manage";

/* ── Permission matrix ──────────────────────────────────────────── */

/**
 * Default permission grants per role. Read this as the floor — chart
 * privacy can still subtract from this list on a per-patient basis.
 */
const PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  // Patients see their own portal experience, not the chart. They get
  // demographics-read for their own row only; that check lives in the
  // portal data loaders, not here.
  patient: new Set<Permission>(["patient.demographics.read"]),

  // Front office (schedulers, receptionists). Demographics + billing
  // only. Clinical data: denied.
  front_office: new Set<Permission>([
    "patient.demographics.read",
    "patient.demographics.edit",
    "billing.read",
    "billing.edit",
  ]),

  // Back office (billers, coders, MAs). Read-only access to clinical
  // notes so they can code, plus full billing edit. Cannot author or
  // edit notes.
  back_office: new Set<Permission>([
    "patient.demographics.read",
    "patient.demographics.edit",
    "billing.read",
    "billing.edit",
    "notes.read",
    "clinical_history.read",
  ]),

  // Mid-level providers (NP, PA). Can view + edit notes and write
  // prescriptions in scope, but co-signature is required for sensitive
  // sections (controlled-substance Rx, certain procedures, behavioral
  // health encounters). The `notes.cosign_required` permission is the
  // signal — the workflow layer reads it and enforces the queue.
  midlevel: new Set<Permission>([
    "patient.demographics.read",
    "patient.demographics.edit",
    "billing.read",
    "notes.read",
    "notes.edit",
    "clinical_history.read",
    "sensitive_diagnoses.read",
    "prescriptions.read",
    "prescriptions.write",
    "labs.read",
    "labs.sign",
    "notes.cosign_required",
  ]),

  // Clinician (MD, DO). Full clinical access; sign-off authority.
  clinician: new Set<Permission>([
    "patient.demographics.read",
    "patient.demographics.edit",
    "billing.read",
    "billing.edit",
    "notes.read",
    "notes.edit",
    "clinical_history.read",
    "sensitive_diagnoses.read",
    "prescriptions.read",
    "prescriptions.write",
    "labs.read",
    "labs.sign",
    "chart.privacy.manage",
  ]),

  // Practice owner — typically a clinician + operator. Same clinical
  // surface as clinician, plus privacy management.
  practice_owner: new Set<Permission>([
    "patient.demographics.read",
    "patient.demographics.edit",
    "billing.read",
    "billing.edit",
    "notes.read",
    "notes.edit",
    "clinical_history.read",
    "sensitive_diagnoses.read",
    "prescriptions.read",
    "prescriptions.write",
    "labs.read",
    "labs.sign",
    "chart.privacy.manage",
  ]),

  // Non-clinical admin roles get no clinical permissions by default.
  // They administer the practice, not the chart.
  operator: new Set<Permission>(["billing.read"]),
  practice_admin: new Set<Permission>(["billing.read"]),

  // Platform-level roles. They operate above the patient surface; they
  // do not need PHI grants from this matrix. If they ever do, that
  // should be an explicit break-glass flow, not a default.
  implementation_admin: new Set<Permission>(),
  super_admin: new Set<Permission>(),
  system: new Set<Permission>(),
  leafnerd: new Set<Permission>(),
};

/* ── Errors ─────────────────────────────────────────────────────── */

/**
 * Thrown when a permission check fails. Server actions should let this
 * propagate; layouts catch it and render the "Access Denied" surface.
 */
export class ForbiddenError extends Error {
  readonly permission?: Permission;
  readonly reason: "role" | "chart_restricted" | "missing_org";

  constructor(opts: {
    permission?: Permission;
    reason: "role" | "chart_restricted" | "missing_org";
    message?: string;
  }) {
    super(opts.message ?? "FORBIDDEN");
    this.name = "ForbiddenError";
    this.permission = opts.permission;
    this.reason = opts.reason;
  }
}

/* ── Core checks ────────────────────────────────────────────────── */

/**
 * Does *any* role on this user carry the requested permission?
 * Permissions are union — having a higher-privilege role always grants
 * at least what the lower role would have granted.
 */
export function hasPermission(
  user: Pick<AuthedUser, "roles">,
  permission: Permission,
): boolean {
  for (const role of user.roles) {
    if (PERMISSIONS[role]?.has(permission)) return true;
  }
  return false;
}

/** Throws ForbiddenError if the user lacks the permission. */
export function requirePermission(
  user: Pick<AuthedUser, "roles">,
  permission: Permission,
): void {
  if (!hasPermission(user, permission)) {
    throw new ForbiddenError({ permission, reason: "role" });
  }
}

/**
 * Hides a value from a caller who lacks permission. The default mask is
 * the string "[REDACTED]" so masking is visible in the UI rather than
 * silently dropping data — a front-office user looking at an encounter
 * card should *see* that a diagnosis exists, just not what it is.
 */
export function maskIfMissing<T>(
  user: Pick<AuthedUser, "roles">,
  permission: Permission,
  value: T,
  mask: T | "[REDACTED]" = "[REDACTED]" as T,
): T {
  return hasPermission(user, permission) ? value : (mask as T);
}

/* ── Chart privacy ──────────────────────────────────────────────── */

/**
 * Per-patient access shape returned by `loadChartAccess()`. The action
 * layer uses this to short-circuit before loading PHI; the layout uses
 * it to render the "Access Denied" surface.
 */
export interface ChartAccess {
  patientId: string;
  organizationId: string;
  /** True if the patient row is flagged doctor-only / restricted. */
  isRestricted: boolean;
  /**
   * True when this specific user is on the chart's allowlist (or has a
   * role that bypasses the restriction — practice_owner). False when
   * the chart is restricted *and* the user is not allowed.
   */
  isAllowed: boolean;
  reason: string | null;
}

/**
 * Owner-class roles bypass the chart-restricted allowlist. They are the
 * "break-glass" tier for the practice; their actions are still audited
 * via AuditLog (every PHI write goes there per schema.prisma:6).
 */
const PRIVACY_BYPASS_ROLES: ReadonlySet<Role> = new Set<Role>([
  "practice_owner",
  "super_admin",
]);

/**
 * Load chart-access state for the user against the given patient. Does
 * not throw — call `requireChartAccess()` if you want the assertion
 * variant. Returns null when the patient doesn't exist or belongs to a
 * different org (so callers can fall through to a generic notFound()).
 */
export async function loadChartAccess(
  user: AuthedUser,
  patientId: string,
): Promise<ChartAccess | null> {
  if (!user.organizationId) return null;

  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId: user.organizationId,
      deletedAt: null,
    },
    select: {
      id: true,
      organizationId: true,
      chartRestricted: true,
      restrictedProviderIds: true,
      chartRestrictedReason: true,
    },
  });

  if (!patient) return null;

  if (!patient.chartRestricted) {
    return {
      patientId: patient.id,
      organizationId: patient.organizationId,
      isRestricted: false,
      isAllowed: true,
      reason: null,
    };
  }

  // Chart is restricted. Allow only:
  //  - Users explicitly on the chart's provider allowlist
  //  - Bypass roles (practice_owner, super_admin) — audited break-glass
  const onAllowlist = patient.restrictedProviderIds.includes(user.id);
  const hasBypassRole = user.roles.some((r) => PRIVACY_BYPASS_ROLES.has(r));

  return {
    patientId: patient.id,
    organizationId: patient.organizationId,
    isRestricted: true,
    isAllowed: onAllowlist || hasBypassRole,
    reason: patient.chartRestrictedReason,
  };
}

/**
 * Assert that the user can read the patient's clinical chart at all.
 * Combines the chart-privacy gate with a base "can read demographics"
 * permission check (every chart loader needs at least that). Throws
 * ForbiddenError on denial; returns the ChartAccess on success.
 *
 * Call this at the top of every patient-scoped server action and
 * layout BEFORE loading PHI.
 */
export async function assertChartAccess(
  user: AuthedUser,
  patientId: string,
): Promise<ChartAccess> {
  if (!user.organizationId) {
    throw new ForbiddenError({ reason: "missing_org" });
  }

  // Baseline: you must be allowed to see demographics to be on a chart
  // at all. (Patients-as-users never hit this path; their portal uses
  // a different loader.)
  requirePermission(user, "patient.demographics.read");

  const access = await loadChartAccess(user, patientId);
  if (!access) {
    throw new ForbiddenError({ reason: "missing_org" });
  }

  if (access.isRestricted && !access.isAllowed) {
    throw new ForbiddenError({
      reason: "chart_restricted",
      message: "CHART_RESTRICTED",
    });
  }

  return access;
}

/**
 * Section-level gate for a specific chart section (notes, clinical
 * history, sensitive diagnoses, prescriptions). Layered on top of
 * assertChartAccess. Use when a single page has multiple sections and
 * some are denied while others are visible — front-office on the
 * demographics card, denied on the notes card.
 *
 * Returns true if the section should render; false if the UI should
 * show a masked / "Access Denied" placeholder.
 */
export function canViewSection(
  user: Pick<AuthedUser, "roles">,
  section:
    | "demographics"
    | "billing"
    | "notes"
    | "clinical_history"
    | "sensitive_diagnoses"
    | "prescriptions"
    | "labs",
): boolean {
  switch (section) {
    case "demographics":
      return hasPermission(user, "patient.demographics.read");
    case "billing":
      return hasPermission(user, "billing.read");
    case "notes":
      return hasPermission(user, "notes.read");
    case "clinical_history":
      return hasPermission(user, "clinical_history.read");
    case "sensitive_diagnoses":
      return hasPermission(user, "sensitive_diagnoses.read");
    case "prescriptions":
      return hasPermission(user, "prescriptions.read");
    case "labs":
      return hasPermission(user, "labs.read");
  }
}

/** Edit-equivalent of `canViewSection`. */
export function canEditSection(
  user: Pick<AuthedUser, "roles">,
  section: "demographics" | "billing" | "notes" | "prescriptions",
): boolean {
  switch (section) {
    case "demographics":
      return hasPermission(user, "patient.demographics.edit");
    case "billing":
      return hasPermission(user, "billing.edit");
    case "notes":
      return hasPermission(user, "notes.edit");
    case "prescriptions":
      return hasPermission(user, "prescriptions.write");
  }
}

/**
 * Mid-level providers carry the `notes.cosign_required` flag; this
 * helper exposes that decision so the note workflow can route to a
 * clinician sign-off queue instead of finalizing.
 */
export function requiresCosignature(user: Pick<AuthedUser, "roles">): boolean {
  // A user who *also* holds a clinician role is their own attestor; no
  // co-signature needed. (Common in small practices where the same MD
  // sits on multiple membership rows.)
  if (user.roles.includes("clinician") || user.roles.includes("practice_owner")) {
    return false;
  }
  return hasPermission(user, "notes.cosign_required");
}
