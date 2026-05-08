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
import type { AuthedUser } from "./session";

export const LEAFJOURNEY_HQ_SLUG = "leafjourney-hq";
const LEAFJOURNEY_HQ_NAME = "LeafJourney HQ";

function bootstrapAllowlist(): Set<string> {
  const raw = process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS ?? "";
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
  return true;
}
