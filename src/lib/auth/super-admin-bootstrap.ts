// Bootstrap allowlist for the super_admin role.
//
// Why this lives separately from ./super-admin.ts:
//   super-admin.ts is the strict RBAC gate (throws FORBIDDEN if you don't
//   already hold the role). This module is the orthogonal concern: a
//   lazy-promotion helper that grants the role to users whose email is in
//   SUPER_ADMIN_BOOTSTRAP_EMAILS the first time they hit a super-admin
//   surface. It's the "I lost the keys" recovery path — once promoted, the
//   user can grant the role to others through the /admin console.
//
// Membership.organizationId is non-null in the schema, so super_admins are
// scoped to a synthetic "LeafJourney HQ" organization. That org has no
// patient/practice data — it exists purely as a Membership anchor.
//
// Caller pattern:
//   await bootstrapSuperAdminIfAllowlisted(await requireUser());
//   await requireSuperAdmin();   // strict gate, no bootstrap inside
//
// The two calls are deliberately separate so the strict gate stays a pure
// role check (matching `requireRole()` semantics in session.ts).

import "server-only";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import type { AuthedUser } from "./session";

export const LEAFJOURNEY_HQ_SLUG = "leafjourney-hq";
const LEAFJOURNEY_HQ_NAME = "LeafJourney HQ";

/**
 * Returns the bootstrap email allowlist when bootstrap is *explicitly
 * enabled* for this environment. Returns an empty set otherwise.
 *
 * Why two flags? Earlier behaviour treated SUPER_ADMIN_BOOTSTRAP_EMAILS
 * as both the data and the kill-switch — leaving the var populated in
 * prod meant every request to a super-admin surface was a potential
 * silent grant. We now require an explicit \`SUPER_ADMIN_BOOTSTRAP_ENABLED=1\`
 * flag in production. Non-production environments can run with just the
 * email list (developer ergonomics).
 *
 * Operational pattern in prod:
 *   1. Set both vars, deploy.
 *   2. Sign in once → gets promoted, audit row written.
 *   3. Unset SUPER_ADMIN_BOOTSTRAP_ENABLED, redeploy.
 *   4. Bootstrap is closed; further admins must be granted through
 *      the /admin console by an existing super_admin.
 */
function bootstrapAllowlist(): Set<string> {
  const raw = process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS ?? "";
  const enabled = process.env.SUPER_ADMIN_BOOTSTRAP_ENABLED === "1";
  const isProd = process.env.NODE_ENV === "production";

  // Production requires the explicit enable flag. Non-production trusts
  // the email list alone so dev environments don't need an extra var.
  if (isProd && !enabled) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0),
  );
}

/**
 * Idempotently ensure the LeafJourney HQ organization row exists. Returns
 * its id. Used both by the lazy-promotion helper and the seed.
 */
export async function ensureLeafjourneyHq(): Promise<string> {
  const org = await prisma.organization.upsert({
    where: { slug: LEAFJOURNEY_HQ_SLUG },
    update: {},
    create: { slug: LEAFJOURNEY_HQ_SLUG, name: LEAFJOURNEY_HQ_NAME },
    select: { id: true },
  });
  return org.id;
}

/**
 * If `user.email` is in `SUPER_ADMIN_BOOTSTRAP_EMAILS` and they don't yet
 * hold super_admin, grant it to them in the HQ org. Mutates `user.roles` in
 * place so a subsequent `requireSuperAdmin()` in the same request sees the
 * new role.
 *
 * Returns true when a promotion happened, false otherwise.
 */
export async function bootstrapSuperAdminIfAllowlisted(
  user: AuthedUser,
): Promise<boolean> {
  if (user.roles.includes("super_admin")) return false;
  const allowlist = bootstrapAllowlist();
  if (allowlist.size === 0) return false;
  if (!allowlist.has(user.email.toLowerCase())) return false;

  const hqOrgId = await ensureLeafjourneyHq();
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: user.id,
        organizationId: hqOrgId,
        role: "super_admin",
      },
    },
    update: {},
    create: {
      userId: user.id,
      organizationId: hqOrgId,
      role: "super_admin",
    },
  });
  user.roles = [...user.roles, "super_admin"];

  // Emit a controller-audit row so this silent-grant path is observable.
  // Logged with subject = the promoted user, actor = the same user (the
  // grant is initiated by the request itself, not by another admin).
  // Imported lazily to avoid a circular dep between session.ts and
  // audit-stub.ts at module init.
  try {
    const { logControllerAction } = await import("./audit-stub");
    await logControllerAction({
      actor: {
        id: user.id,
        email: user.email,
        roles: user.roles,
        organizationId: user.organizationId,
      },
      action: "controller.super_admin.bootstrap_grant",
      targetId: user.id,
      after: { email: user.email, hqOrgId },
      reason:
        "Lazy-promote via SUPER_ADMIN_BOOTSTRAP_EMAILS allowlist " +
        "(NODE_ENV=" + (process.env.NODE_ENV ?? "unset") + ").",
    });
  } catch (err) {
    // Don't block the grant on a failed audit row — but make sure the
    // failure is loud. Silently-promoted super-admins with no audit
    // trail is the exact failure mode this module is supposed to avoid.
    logger.error({
      event: "auth.bootstrap.audit_write_failed",
      userId: user.id,
      err,
      message:
        "Promoted user but audit row failed to persist — investigate immediately.",
    });
  }

  return true;
}
