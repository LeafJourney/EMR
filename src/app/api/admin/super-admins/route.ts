// /api/admin/super-admins
//
// GET  → list all users with the super_admin role.
// POST → grant the super_admin role by email. Body: { email: string }
//        If no User row exists for that email, returns 404 — the user must
//        sign in once first so Clerk provisions their User row, then the
//        super-admin can grant them the role.
//
// Both operations are super-admin-only and audited.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { ensureLeafjourneyHq } from "@/lib/auth/super-admin-bootstrap";
import { logControllerAction } from "@/lib/auth/audit-stub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const grantSchema = z.object({
  email: z.string().email().max(254),
});

export async function GET() {
  const gate = await requireApiAuth({ role: "super_admin" });
  if (gate.error) return gate.error;

  const memberships = await prisma.membership.findMany({
    where: { role: "super_admin" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      createdAt: true,
      user: {
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          lastLoginAt: true,
        },
      },
    },
  });

  // Collapse per user — the Membership table can have multiple rows per user
  // if they hold super_admin in more than one org (today only the HQ org is
  // expected, but defend against the general case).
  const seen = new Set<string>();
  const items = [];
  for (const m of memberships) {
    if (seen.has(m.userId)) continue;
    seen.add(m.userId);
    items.push({
      userId: m.user.id,
      email: m.user.email,
      firstName: m.user.firstName,
      lastName: m.user.lastName,
      grantedAt: m.createdAt,
      lastLoginAt: m.user.lastLoginAt,
    });
  }

  return NextResponse.json({ items });
}

export async function POST(req: Request) {
  const gate = await requireApiAuth({ role: "super_admin" });
  if (gate.error) return gate.error;
  const actor = gate.actor;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = grantSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const email = parsed.data.email.trim().toLowerCase();
  const targetUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!targetUser) {
    return NextResponse.json(
      {
        error: "user_not_found",
        hint: "Have them sign in once first — Clerk creates the User row on first sign-in.",
      },
      { status: 404 },
    );
  }

  const hqOrgId = await ensureLeafjourneyHq();
  await prisma.membership.upsert({
    where: {
      userId_organizationId_role: {
        userId: targetUser.id,
        organizationId: hqOrgId,
        role: "super_admin",
      },
    },
    update: {},
    create: {
      userId: targetUser.id,
      organizationId: hqOrgId,
      role: "super_admin",
    },
  });

  await logControllerAction({
    actor: {
      id: actor.id,
      email: actor.email,
      roles: actor.roles,
      organizationId: actor.organizationId,
    },
    action: "controller.super_admin.grant",
    targetId: targetUser.id,
    after: { email: targetUser.email },
    reason: `Granted super_admin to ${targetUser.email}`,
  });

  return NextResponse.json({
    ok: true,
    user: {
      userId: targetUser.id,
      email: targetUser.email,
      firstName: targetUser.firstName,
      lastName: targetUser.lastName,
    },
  });
}
