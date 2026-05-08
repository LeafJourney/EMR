// DELETE /api/admin/super-admins/[userId]
//
// Revokes the super_admin role from a user. Two safety rails:
//   1. You may not revoke yourself — prevents the operator from accidentally
//      locking themselves out. They must have another super-admin do it.
//   2. You may not revoke the last remaining super_admin — there must always
//      be at least one super-admin in the system.
//
// Audited via logControllerAction("controller.super_admin.revoke").

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import { bootstrapSuperAdminIfAllowlisted } from "@/lib/auth/super-admin-bootstrap";
import { logControllerAction } from "@/lib/auth/audit-stub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  let actor;
  try {
    await bootstrapSuperAdminIfAllowlisted(await requireUser());
    actor = await requireSuperAdmin();
  } catch (err) {
    const code = err instanceof Error ? err.message : "FORBIDDEN";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : 403 });
  }

  const targetUserId = params.userId;
  if (!targetUserId) {
    return NextResponse.json({ error: "missing_user_id" }, { status: 400 });
  }

  if (targetUserId === actor.id) {
    return NextResponse.json(
      {
        error: "cannot_revoke_self",
        message: "Have another super-admin revoke your access.",
      },
      { status: 400 },
    );
  }

  // Last-admin guard. Count distinct super_admin users.
  const allSuperAdminMemberships = await prisma.membership.findMany({
    where: { role: "super_admin" },
    select: { userId: true },
  });
  const distinctUsers = new Set(allSuperAdminMemberships.map((m) => m.userId));
  if (distinctUsers.size <= 1) {
    return NextResponse.json(
      { error: "cannot_revoke_last_super_admin" },
      { status: 400 },
    );
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  await prisma.membership.deleteMany({
    where: { userId: targetUserId, role: "super_admin" },
  });

  await logControllerAction({
    actor: {
      id: actor.id,
      email: actor.email,
      roles: actor.roles,
      organizationId: actor.organizationId,
    },
    action: "controller.super_admin.revoke",
    targetId: targetUserId,
    before: { email: targetUser.email },
    reason: `Revoked super_admin from ${targetUser.email}`,
  });

  return NextResponse.json({ ok: true });
}
