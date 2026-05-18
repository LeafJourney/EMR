// EMR-725 — Super-admin MFA enforcement.
//
// Why this lives separately from ./super-admin.ts:
//   super-admin.ts is the pure role gate ("does the actor hold the role?").
//   This module is the orthogonal security check ("does the actor with that
//   role have an enrolled second factor, or are they still inside the
//   one-time 14-day grace window?").
//
// Grace window design (the only non-obvious piece in this PR):
//   When EMR-725 ships, existing super-admins may not have MFA enrolled —
//   abruptly locking them out would brick the operations team. So on the
//   first sign-in by an EXISTING super_admin without MFA we stamp a
//   `mfaGraceUntil = now + 14 days` on their Membership row. During those
//   14 days the gate emits a warning audit row and a banner appears in the
//   super-admin shell, but the request is allowed through. After the
//   deadline, the gate hard-blocks with a structured `mfa_required` 403.
//
//   Fresh bootstrap grants (SUPER_ADMIN_BOOTSTRAP_EMAILS path) do NOT get
//   a grace window — the bootstrap helper refuses to promote a user whose
//   Clerk identity has no enrolled factor in the first place.

import "server-only";

import { auth, currentUser as clerkCurrentUser } from "@clerk/nextjs/server";
import type { User as ClerkUser } from "@clerk/backend";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import type { AuthedUser } from "./session";

/** 14 days, in milliseconds. */
export const SUPER_ADMIN_MFA_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

/** Clerk path users are redirected to for MFA enrollment. */
export const MFA_ENROLL_PATH = "/sign-in/factor-two";

/**
 * Resolved MFA state for the currently-authenticated super_admin.
 *
 *   - status="enrolled"    → MFA is on; no friction.
 *   - status="grace"       → MFA missing but grace window active.
 *                            Caller should let the request through and
 *                            surface a banner / warn-audit.
 *   - status="blocked"     → MFA missing and grace expired (or never
 *                            existed). Caller MUST 403.
 *   - status="not_super"   → Actor is not a super_admin — caller should
 *                            skip this check entirely.
 *
 * `graceUntil` is populated for the "grace" and "blocked" states so the
 * 403 envelope and banner can surface the deadline.
 */
export type SuperAdminMfaState =
  | { status: "enrolled" }
  | { status: "grace"; graceUntil: Date }
  | { status: "blocked"; graceUntil: Date | null }
  | { status: "not_super" };

/**
 * Bypass flag for non-production environments that don't want to set up
 * Clerk MFA locally. Production always enforces.
 */
function mfaEnforcementDisabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  return process.env.SUPER_ADMIN_MFA_ENFORCE === "0";
}

/**
 * True when the Clerk user has any second factor enrolled. We accept
 * TOTP, backup codes, or Clerk's generic twoFactorEnabled flag — any one
 * of them satisfies the "has a second factor" check.
 */
export function clerkUserHasMfa(
  user: Pick<ClerkUser, "twoFactorEnabled" | "totpEnabled" | "backupCodeEnabled"> | null,
): boolean {
  if (!user) return false;
  return Boolean(user.twoFactorEnabled || user.totpEnabled || user.backupCodeEnabled);
}

/**
 * Load the current Clerk user (server-side). Wrapper exists so tests can
 * mock one symbol rather than the entire `@clerk/nextjs/server` surface.
 */
export async function getCurrentClerkUserForMfa(): Promise<ClerkUser | null> {
  const { userId } = await auth();
  if (!userId) return null;
  return await clerkCurrentUser();
}

/**
 * Resolve the actor's super-admin MFA state. Stamps the grace deadline on
 * first read when needed.
 *
 *   - If the actor is not super_admin → "not_super".
 *   - If MFA is enrolled → "enrolled" (and any stale grace timestamp is
 *     cleared as a side-effect — the actor no longer needs the warning
 *     banner).
 *   - Otherwise, look at the Membership.mfaGraceUntil column:
 *       null  → first observation; stamp now+14d and return "grace".
 *       future → still in grace; return "grace".
 *       past   → grace expired; return "blocked".
 */
export async function resolveSuperAdminMfaState(
  user: AuthedUser,
  clerkUser: Pick<ClerkUser, "twoFactorEnabled" | "totpEnabled" | "backupCodeEnabled"> | null,
): Promise<SuperAdminMfaState> {
  if (!user.roles.includes("super_admin")) {
    return { status: "not_super" };
  }

  if (mfaEnforcementDisabled()) {
    return { status: "enrolled" };
  }

  if (clerkUserHasMfa(clerkUser)) {
    // Clear any lingering grace row — once MFA is on, the banner stops.
    try {
      await prisma.membership.updateMany({
        where: {
          userId: user.id,
          role: "super_admin",
          mfaGraceUntil: { not: null },
        },
        data: { mfaGraceUntil: null },
      });
    } catch (err) {
      // Don't fail the request on a grace-clear hiccup; the banner will
      // simply persist until the next successful write.
      logger.warn({
        event: "auth.super_admin_mfa.clear_grace_failed",
        userId: user.id,
        err,
      });
    }
    return { status: "enrolled" };
  }

  // MFA not enrolled — consult the grace clock.
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, role: "super_admin" },
    select: { id: true, mfaGraceUntil: true },
    orderBy: { createdAt: "asc" },
  });

  if (!membership) {
    // Defensive: roles include super_admin but no Membership row matches.
    // Treat as blocked so we don't accidentally hand out a grace.
    return { status: "blocked", graceUntil: null };
  }

  const now = Date.now();

  if (membership.mfaGraceUntil == null) {
    const graceUntil = new Date(now + SUPER_ADMIN_MFA_GRACE_MS);
    try {
      await prisma.membership.update({
        where: { id: membership.id },
        data: { mfaGraceUntil: graceUntil },
      });
    } catch (err) {
      // If the stamp fails, treat as blocked so we don't hand out an
      // unbounded grace via repeated failed writes.
      logger.error({
        event: "auth.super_admin_mfa.stamp_grace_failed",
        userId: user.id,
        err,
      });
      return { status: "blocked", graceUntil: null };
    }
    return { status: "grace", graceUntil };
  }

  if (membership.mfaGraceUntil.getTime() > now) {
    return { status: "grace", graceUntil: membership.mfaGraceUntil };
  }

  return { status: "blocked", graceUntil: membership.mfaGraceUntil };
}

/**
 * Convenience wrapper used by the page-layout gate: loads the Clerk user
 * AND resolves the state in one call.
 */
export async function loadSuperAdminMfaState(
  user: AuthedUser,
): Promise<SuperAdminMfaState> {
  const clerkUser = await getCurrentClerkUserForMfa();
  return await resolveSuperAdminMfaState(user, clerkUser);
}

/**
 * The structured 403 body returned to API callers when MFA is required.
 * Stable shape so clients can branch on `code === "mfa_required"`.
 */
export interface MfaRequiredBody {
  code: "mfa_required";
  error: "MFA_REQUIRED";
  message: string;
  enrollUrl: string;
  graceUntil: string | null;
}

export function buildMfaRequiredResponse(graceUntil: Date | null): Response {
  const body: MfaRequiredBody = {
    code: "mfa_required",
    error: "MFA_REQUIRED",
    message: "Super-admin role requires an enrolled second factor.",
    enrollUrl: MFA_ENROLL_PATH,
    graceUntil: graceUntil ? graceUntil.toISOString() : null,
  };
  return new Response(JSON.stringify(body), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

/** Typed error thrown from server-component gates so the layout can catch + redirect. */
export class MfaRequiredError extends Error {
  readonly code = "MFA_REQUIRED";
  readonly graceUntil: Date | null;
  constructor(graceUntil: Date | null) {
    super("MFA_REQUIRED");
    this.graceUntil = graceUntil;
  }
}
