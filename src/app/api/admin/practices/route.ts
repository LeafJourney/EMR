// GET /api/admin/practices
//
// Super-admin only: lists every PracticeConfiguration that has been published
// (or is in flight as a draft), joined with its Organization name so the
// console can render a row per practice with current specialty.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { LEAFJOURNEY_HQ_SLUG } from "@/lib/auth/super-admin-bootstrap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await requireApiAuth({ role: "super_admin" });
  if (gate.error) return gate.error;

  const configs = await prisma.practiceConfiguration.findMany({
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true,
      organizationId: true,
      practiceId: true,
      selectedSpecialty: true,
      selectedSpecialtyVersion: true,
      status: true,
      version: true,
      publishedAt: true,
      updatedAt: true,
    },
  });

  const orgIds = Array.from(new Set(configs.map((c) => c.organizationId)));
  const orgs = orgIds.length
    ? await prisma.organization.findMany({
        where: { id: { in: orgIds } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const orgById = new Map(orgs.map((o) => [o.id, o]));

  const items = configs
    // Hide the synthetic HQ org from the practice list — it's not a practice.
    .filter((c) => orgById.get(c.organizationId)?.slug !== LEAFJOURNEY_HQ_SLUG)
    .map((c) => ({
      configId: c.id,
      organizationId: c.organizationId,
      organizationName: orgById.get(c.organizationId)?.name ?? "(unknown)",
      organizationSlug: orgById.get(c.organizationId)?.slug ?? null,
      selectedSpecialty: c.selectedSpecialty,
      selectedSpecialtyVersion: c.selectedSpecialtyVersion,
      status: c.status,
      version: c.version,
      publishedAt: c.publishedAt,
      updatedAt: c.updatedAt,
    }));

  return NextResponse.json({ items });
}
