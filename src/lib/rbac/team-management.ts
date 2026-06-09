// Back-Office Operations Audit §7 — practice-facing role management.
//
// The audit's headline risk: "there is no non-clinical staff role; the
// office-manager account carries a PROVIDER role with chart-signing rights."
// The Role enum + `permissions.ts` matrix already model non-clinical roles
// correctly (front_office/back_office cannot edit or sign notes). What was
// missing is a *surface* for an owner/admin to see and assign those roles —
// that is what /ops/team provides, and this module is its pure rule core.
//
// Everything here is dependency-free (type-only Prisma import) so it is
// safe to import from both server actions and client components, and is
// trivially unit-testable without a database.

import type { Role } from "@prisma/client";

export interface StaffRoleMeta {
  role: Role;
  /** Human label. Maps the Role enum to the audit's §7 role names. */
  label: string;
  /** The §7 station(s) this role owns. */
  station: string;
  /** One-line scope summary shown on the roster. */
  scope: string;
  /**
   * True when the role can author and/or sign clinical notes. The audit's
   * core principle: clinical authoring/signing is a permission, not a
   * default — so the UI flags these roles explicitly.
   */
  clinicalAuthoring: boolean;
  /**
   * Elevated roles (owner/admin) can only be granted or revoked by an owner
   * or super-admin — never by a practice_admin managing line staff.
   */
  elevated: boolean;
}

/**
 * Roles a practice can assign to its own staff from /ops/team, in display
 * order. Platform roles (super_admin, implementation_admin, system,
 * leafnerd) and the realm roles (patient, kiosk) are deliberately ABSENT —
 * they are never granted from a practice admin tool.
 */
export const STAFF_ROLES: readonly StaffRoleMeta[] = [
  {
    role: "front_office",
    label: "Front Desk / Scheduler",
    station: "Pre-visit · Arrival · Checkout",
    scope:
      "Book/confirm, check-in, capture insurance & consent, collect copay, book follow-up.",
    clinicalAuthoring: false,
    elevated: false,
  },
  {
    role: "back_office",
    label: "Medical Assistant / Biller",
    station: "Arrival (rooming) · Post-visit RCM",
    scope:
      "Room patients, record vitals, read notes to code; full billing. Cannot author or sign notes.",
    clinicalAuthoring: false,
    elevated: false,
  },
  {
    role: "midlevel",
    label: "Mid-Level Provider (NP/PA)",
    station: "Visit",
    scope:
      "Author notes and prescribe in scope; sensitive items require a clinician co-signature.",
    clinicalAuthoring: true,
    elevated: false,
  },
  {
    role: "clinician",
    label: "Provider",
    station: "Visit · Sign-off",
    scope: "Full chart, orders, sign notes, release care plans, approve refills.",
    clinicalAuthoring: true,
    elevated: false,
  },
  {
    role: "operator",
    label: "Office Manager",
    station: "All ops (no chart authoring)",
    scope:
      "Waitlist, inventory, reporting, task assignment. Read-only chart access.",
    clinicalAuthoring: false,
    elevated: false,
  },
  {
    role: "practice_admin",
    label: "Practice Admin",
    station: "Administration",
    scope: "Practice settings, templates, reporting. Manages line staff.",
    clinicalAuthoring: false,
    elevated: true,
  },
  {
    role: "practice_owner",
    label: "Admin / Owner",
    station: "Administration",
    scope:
      "Manage roles/permissions, settings, audit. Clinical authority only if also a provider.",
    clinicalAuthoring: true,
    elevated: true,
  },
];

const STAFF_ROLE_SET = new Set<Role>(STAFF_ROLES.map((r) => r.role));
const STAFF_ROLE_BY_ID = new Map<Role, StaffRoleMeta>(
  STAFF_ROLES.map((r) => [r.role, r]),
);

/** Roles permitted to manage the team at all. */
const TEAM_MANAGER_ROLES = new Set<Role>([
  "practice_owner",
  "practice_admin",
  "super_admin",
]);

/** Roles permitted to grant/revoke ELEVATED staff roles (owner / admin). */
const ELEVATED_MANAGER_ROLES = new Set<Role>(["practice_owner", "super_admin"]);

export function isStaffRole(role: Role): boolean {
  return STAFF_ROLE_SET.has(role);
}

export function staffRoleMeta(role: Role): StaffRoleMeta | undefined {
  return STAFF_ROLE_BY_ID.get(role);
}

/** Can this set of roles manage the practice team at all? */
export function canManageTeam(roles: Role[]): boolean {
  return roles.some((r) => TEAM_MANAGER_ROLES.has(r));
}

/** Can this set of roles grant/revoke elevated (owner/admin) roles? */
export function canManageElevatedRoles(roles: Role[]): boolean {
  return roles.some((r) => ELEVATED_MANAGER_ROLES.has(r));
}

export type RoleChangeError =
  | "forbidden" // actor can't manage the team
  | "not_manageable" // target role isn't a practice-assignable staff role
  | "needs_owner" // only owner/super_admin may manage elevated roles
  | "last_owner" // would remove the org's last practice_owner
  | "last_role" // would strand the member with no roles
  | "noop"; // nothing to change

export const ROLE_CHANGE_MESSAGES: Record<RoleChangeError, string> = {
  forbidden: "You don't have permission to manage the team.",
  not_manageable: "That role can't be assigned from this surface.",
  needs_owner: "Only an owner can grant or revoke owner / admin roles.",
  last_owner:
    "This is the practice's last owner — assign another owner before removing this one.",
  last_role:
    "A team member must keep at least one role. Remove the member instead.",
  noop: "No change.",
};

export interface RoleChangeContext {
  /** Roles held by the user performing the change. */
  actorRoles: Role[];
  /** The role being added or removed. */
  targetRole: Role;
  /** All roles the target member currently holds in this org. */
  memberCurrentRoles: Role[];
  /** Count of practice_owner memberships in the org (last-owner guard). */
  ownerCount: number;
}

function commonGuards(ctx: RoleChangeContext): RoleChangeError | null {
  if (!canManageTeam(ctx.actorRoles)) return "forbidden";
  if (!isStaffRole(ctx.targetRole)) return "not_manageable";
  if (
    staffRoleMeta(ctx.targetRole)?.elevated &&
    !canManageElevatedRoles(ctx.actorRoles)
  ) {
    return "needs_owner";
  }
  return null;
}

/** Pure precondition check for granting a role. Returns null when allowed. */
export function checkAddRole(ctx: RoleChangeContext): RoleChangeError | null {
  const guard = commonGuards(ctx);
  if (guard) return guard;
  if (ctx.memberCurrentRoles.includes(ctx.targetRole)) return "noop";
  return null;
}

/** Pure precondition check for revoking a role. Returns null when allowed. */
export function checkRemoveRole(ctx: RoleChangeContext): RoleChangeError | null {
  const guard = commonGuards(ctx);
  if (guard) return guard;
  if (!ctx.memberCurrentRoles.includes(ctx.targetRole)) return "noop";
  // Don't strand a member with zero roles — they'd be orphaned in the org.
  if (ctx.memberCurrentRoles.length <= 1) return "last_role";
  // Don't lock the practice out of ownership.
  if (ctx.targetRole === "practice_owner" && ctx.ownerCount <= 1) {
    return "last_owner";
  }
  return null;
}
