// GET /api/users/[id]/preview
//
// Lightweight user/provider summary for the HoverCard primitive. Returns
// just the fields needed to render a one-glance card: name, title, NPI,
// last login, and primary role within the caller's organization. Heavy
// data (auditable history, encounters, etc.) is intentionally excluded.
//
// Auth: any signed-in user. Scope is enforced via the actor's
// organizationId — we only return data for users who share an
// organization (membership) with the caller. Cross-org probing returns 404.

import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  const gate = await requireApiAuth();
  if (gate.error) return gate.error;
  const orgId = gate.actor.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "no_org" }, { status: 403 });
  }

  // Confirm shared org via Membership, then fetch the public bits.
  const membership = await prisma.membership.findFirst({
    where: { userId: params.id, organizationId: orgId },
    select: { role: true },
  });
  if (!membership) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      lastLoginAt: true,
      providerProfile: {
        select: {
          title: true,
          specialties: true,
          npi: true,
          active: true,
        },
      },
    },
  });
  if (!user) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: membership.role,
    title: user.providerProfile?.title ?? null,
    specialties: user.providerProfile?.specialties ?? [],
    npi: user.providerProfile?.npi ?? null,
    active: user.providerProfile?.active ?? true,
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  });
}
