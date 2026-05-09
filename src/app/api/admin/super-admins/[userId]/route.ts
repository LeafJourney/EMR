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
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { logControllerAction } from "@/lib/auth/audit-stub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  { params }: { params: { userId: string } },
) {
  const gate = await requireApiAuth({ role: "super_admin" });
  if (gate.error) return gate.error;
  const actor = gate.actor;

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


  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true, email: true },
  });
  if (!targetUser) {
    return NextResponse.json({ error: "user_not_found" }, { status: 404 });
  }

  // Last-admin guard. The check + delete must be a single serializable
  // transaction; otherwise two concurrent revokes could each see "2 admins
  // remaining", both pass the guard, and both delete — leaving zero.
  // We delete first, then verify ≥1 super_admin remains; under Serializable
  // isolation, concurrent transactions that would violate the invariant
  // surface as serialization failures rather than silent zero-admin states.
  try {
    await prisma.$transaction(
      async (tx) => {
        await tx.membership.deleteMany({
          where: { userId: targetUserId, role: "super_admin" },
        });
        const remaining = await tx.membership.findMany({
          where: { role: "super_admin" },
          select: { userId: true },
        });
        const distinctRemaining = new Set(remaining.map((m) => m.userId));
        if (distinctRemaining.size < 1) {
          throw new Error("LAST_SUPER_ADMIN");
        }
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "LAST_SUPER_ADMIN") {
      return NextResponse.json(
        { error: "cannot_revoke_last_super_admin" },
        { status: 400 },
      );
    }
    throw err;
  }

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
