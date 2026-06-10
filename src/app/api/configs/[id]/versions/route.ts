// EMR-471 — GET /api/configs/[id]/versions
//
// Version history list for a practice configuration. Each published version is
// snapshotted into PracticeConfigurationVersion (EMR-469); this surfaces that
// history (newest first) so the admin UI can offer a "view history / roll back"
// affordance. The actual snapshot bodies are returned by the /diff endpoint to
// keep this list cheap. Implementation Admin only.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { withAuthErrors, notFound } from "../../_helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Ctx) {
  return (await withAuthErrors(async () => {
    await requireImplementationAdmin();

    const config = await prisma.practiceConfiguration.findUnique({
      where: { id: params.id },
      select: { id: true, version: true, status: true },
    });
    if (!config) return notFound();

    const versions = await prisma.practiceConfigurationVersion.findMany({
      where: { configurationId: params.id },
      orderBy: { version: "desc" },
      select: { id: true, version: true, publishedAt: true, publishedBy: true },
    });

    return NextResponse.json({
      configurationId: params.id,
      currentVersion: config.version,
      status: config.status,
      versions,
    });
  })) as NextResponse;
}
