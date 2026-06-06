import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { buildPracticeConfigurationVersionDiff } from "@/lib/db/practice-config-versioning";
import { withAuthErrors, notFound } from "../../_helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

export async function GET(req: Request, { params }: Ctx) {
  return (await withAuthErrors(async () => {
    await requireImplementationAdmin();

    const config = await prisma.practiceConfiguration.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!config) return notFound();

    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");

    if (from && to) {
      const versions = await prisma.practiceConfigurationVersion.findMany({
        where: {
          configurationId: params.id,
          version: { in: [Number(from), Number(to)] },
        },
      });
      const fromVersion = versions.find((v) => v.version === Number(from));
      const toVersion = versions.find((v) => v.version === Number(to));
      if (!fromVersion || !toVersion) return notFound();

      return NextResponse.json({
        diff: buildPracticeConfigurationVersionDiff(fromVersion, toVersion),
      });
    }

    const versions = await prisma.practiceConfigurationVersion.findMany({
      where: { configurationId: params.id },
      orderBy: { version: "desc" },
      select: {
        id: true,
        version: true,
        publishedAt: true,
        publishedBy: true,
      },
    });

    return NextResponse.json({ versions });
  })) as NextResponse;
}
