// EMR-428 — RBAC for the Practice Onboarding Controller (LeafJourney v1).
//
// This module is the single source of truth for "who can touch the controller?"
// It mirrors the semantics of `requireRole()` in ./session.ts (server-only,
// throws "FORBIDDEN" on rejection) so call sites stay consistent across the
// codebase.
//
// Roles in scope (see prisma/schema.prisma `enum Role`):
//   - super_admin           : LeafJourney internal — unrestricted
//   - implementation_admin  : LeafJourney internal — runs onboarding wizards
//   - practice_admin        : tenant-side — read-only access to their own
//                             practice's published config
//
// IMPORTANT: LeafJourney is specialty-adaptive, NOT cannabis-first. Nothing in
// this file should branch on specialty. The controller is universal; specialty
// only affects which template/config is loaded downstream.
//
// Defense in depth: middleware does a coarse role gate, but every controller
// route handler MUST also call `requireImplementationAdmin()` (or
// `requireControllerAccess()`) at the top of the handler. Read sites for a
// practice_admin viewing their own published config should use
// `canViewPracticeConfig()`.

import "server-only";

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { type AuthedUser, requireUser } from "./session";

/** Roles allowed to operate the onboarding controller (write-path). */
const CONTROLLER_ROLES: ReadonlyArray<Role> = ["super_admin", "implementation_admin"];

/** Roles allowed to view a practice's own published config (read-path). */
const PRACTICE_VIEWER_ROLES: ReadonlyArray<Role> = [
  "super_admin",
  "implementation_admin",
  "practice_admin",
];

function hasAnyRole(user: AuthedUser, allowed: ReadonlyArray<Role>): boolean {
  return user.roles.some((r) => allowed.includes(r));
}

/**
 * Require the caller to be a LeafJourney super_admin.
 * Throws "FORBIDDEN" otherwise — same contract as `requireRole()` in
 * `./session.ts`. Caller is expected to surface this as a 403.
 */
export async function requireSuperAdmin(): Promise<AuthedUser> {
  const user = await requireUser();
  if (!user.roles.includes("super_admin")) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/**
 * Require the caller to have controller write access.
 * Accepts `implementation_admin` OR `super_admin`.
 */
export async function requireImplementationAdmin(): Promise<AuthedUser> {
  const user = await requireUser();
  if (!hasAnyRole(user, CONTROLLER_ROLES)) {
    throw new Error("FORBIDDEN");
  }
  return user;
}

/**
 * Alias of `requireImplementationAdmin` — preferred at call sites in the
 * onboarding controller surface for clarity. "Controller access" means
 * "may run/save/publish onboarding config" — not "may read a config."
 */
export const requireControllerAccess = requireImplementationAdmin;

/**
 * True when `user` may VIEW the published config for `practiceId`.
 *
 *   - super_admin           : always true
 *   - implementation_admin  : always true (they steward all practices)
 *   - practice_admin        : only when scoped to that practice via Membership
 *
 * All other roles: false. This is read-only; mutation paths must use
 * `requireImplementationAdmin()`.
 */
export async function canViewPracticeConfig(
  user: AuthedUser,
  practiceId: string,
): Promise<boolean> {
  if (!practiceId) return false;

  if (user.roles.includes("super_admin")) return true;
  if (user.roles.includes("implementation_admin")) return true;

  if (!user.roles.includes("practice_admin")) return false;

  // Practice admin: must have an active Membership in the target organization
  // with `practice_admin` role. We re-check against Prisma rather than trust
  // the cached `user.organizationId` because a user may belong to multiple
  // orgs and `organizationId` reflects only their primary membership.
  const membership = await prisma.membership.findFirst({
    where: {
      userId: user.id,
      organizationId: practiceId,
      role: "practice_admin",
    },
    select: { id: true },
  });

  return membership !== null;
}

/**
 * Cheap synchronous predicate — does NOT touch the DB. Useful in middleware
 * or coarse gates where we already have an `AuthedUser` and only need to
 * know whether the user could plausibly hit the controller surface.
 *
 * Note: this is intentionally NOT exported as a `require*` because it
 * skips the practice-scope check that `canViewPracticeConfig` performs.
 */
export function isControllerEligible(user: AuthedUser): boolean {
  return hasAnyRole(user, CONTROLLER_ROLES);
}
