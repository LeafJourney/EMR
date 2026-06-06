// EMR-456 — single migration job status.
//
// GET /api/migration-jobs/:id → the job row (progress counters + status).
// Auth: Implementation Admin (onboarding controller surface).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { notFound, withAuthErrors } from "@/app/api/configs/_helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Ctx) {
  return (await withAuthErrors(async () => {
    await requireImplementationAdmin();

    const job = await prisma.migrationJob.findUnique({
      where: { id: params.id },
    });
    if (!job) return notFound();

    return NextResponse.json({ job });
  })) as NextResponse;
}
