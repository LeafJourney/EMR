// Role predicates for the operator-facing governance surfaces added by this
// track: the Agent Fleet toggle (EMR-974), default approve/reject decisions
// (EMR-960), and provider credentialing (EMR-625/627/628/629).
//
// These sit alongside `permissions.ts` (chart/PHI grants) and `roles.ts`
// (route prefixes). They answer "can this user administer this org-level
// governance setting?" — a coarser question than chart-level PHI access, so a
// dedicated predicate set keeps the PHI matrix uncluttered.

import type { Role } from "@prisma/client";
import type { AuthedUser } from "@/lib/auth/session";

/** Turn AI agents on/off for the practice — provider + operational staff. */
const AGENT_FLEET_MANAGERS: ReadonlyArray<Role> = [
  "operator",
  "practice_owner",
  "practice_admin",
  "super_admin",
];

/** Set org default approve/reject rules — owner-level decision. */
const APPROVAL_DEFAULT_MANAGERS: ReadonlyArray<Role> = [
  "practice_owner",
  "practice_admin",
  "super_admin",
];

/** Manage provider credentialing — compliance/admin staff. */
const CREDENTIALING_MANAGERS: ReadonlyArray<Role> = [
  "operator",
  "practice_owner",
  "practice_admin",
  "super_admin",
];

function hasAny(
  user: Pick<AuthedUser, "roles">,
  allowed: ReadonlyArray<Role>,
): boolean {
  return user.roles.some((r) => allowed.includes(r));
}

export function canManageAgentFleet(user: Pick<AuthedUser, "roles">): boolean {
  return hasAny(user, AGENT_FLEET_MANAGERS);
}

export function canManageApprovalDefaults(
  user: Pick<AuthedUser, "roles">,
): boolean {
  return hasAny(user, APPROVAL_DEFAULT_MANAGERS);
}

export function canManageCredentialing(
  user: Pick<AuthedUser, "roles">,
): boolean {
  return hasAny(user, CREDENTIALING_MANAGERS);
}
