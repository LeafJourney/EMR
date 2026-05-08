// GET /api/admin/practices
//
// Super-admin only: lists every PracticeConfiguration that has been published
// (or is in flight as a draft), joined with its Organization name so the
// console can render a row per practice with current specialty.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import {
  bootstrapSuperAdminIfAllowlisted,
  LEAFJOURNEY_HQ_SLUG,
} from "@/lib/auth/super-admin-bootstrap";
import { requireUser } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await bootstrapSuperAdminIfAllowlisted(await requireUser());
    await requireSuperAdmin();
  } catch (err) {
    const code = err instanceof Error ? err.message : "FORBIDDEN";
    return NextResponse.json({ error: code }, { status: code === "UNAUTHORIZED" ? 401 : 403 });
  }

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
