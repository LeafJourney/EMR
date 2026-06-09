// EMR-456 — migration import job ledger API.
//
// POST /api/migration-jobs   body: { migrationProfileId, sourceType?, idempotencyKey? }
//   Enqueues an import job (status 'queued'). When `idempotencyKey` matches an
//   existing job for the same profile, the existing job is returned unchanged —
//   re-enqueuing the same source is a no-op, never a duplicate import.
// GET  /api/migration-jobs?profileId=<id>   → jobs for that profile (newest first)
//
// The row-by-row import runner lives in src/lib/migration (separate track) and
// polls 'queued' rows; this endpoint is the durable job ledger the admin UI
// reads for progress. Auth: Implementation Admin (onboarding controller surface).

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { logControllerAction } from "@/lib/auth/audit-stub";
import {
  invalidInput,
  readJson,
  withAuthErrors,
} from "@/app/api/configs/_helpers";

export const runtime = "nodejs";

const enqueueInput = z.object({
  migrationProfileId: z.string().min(1),
  sourceType: z.string().max(40).nullish(),
  idempotencyKey: z.string().max(200).nullish(),
});

export async function POST(req: Request) {
  return (await withAuthErrors(async () => {
    const admin = await requireImplementationAdmin();

    const parsedBody = await readJson(req);
    if (!parsedBody.ok) return parsedBody.response;

    const parsed = enqueueInput.safeParse(parsedBody.body);
    if (!parsed.success) return invalidInput(parsed.error);

    const { migrationProfileId, sourceType, idempotencyKey } = parsed.data;

    const profile = await prisma.migrationProfile.findUnique({
      where: { id: migrationProfileId },
      select: { id: true, configurationId: true, sourceType: true },
    });
    if (!profile) {
      return NextResponse.json(
        { error: "migration_profile_not_found" },
        { status: 404 },
      );
    }

    // Resolve the owning org via the linked configuration (FK-light: plain id).
    const config = await prisma.practiceConfiguration.findUnique({
      where: { id: profile.configurationId },
      select: { organizationId: true },
    });
    const organizationId = config?.organizationId ?? admin.organizationId ?? "pending";

    // Idempotency: a re-enqueue with the same key returns the existing job
    // rather than starting a duplicate import.
    if (idempotencyKey) {
      const existing = await prisma.migrationJob.findFirst({
        where: { migrationProfileId, idempotencyKey },
      });
      if (existing) {
        return NextResponse.json({ job: existing, deduplicated: true });
      }
    }

    const job = await prisma.migrationJob.create({
      data: {
        organizationId,
        migrationProfileId,
        configurationId: profile.configurationId,
        sourceType: sourceType ?? profile.sourceType ?? null,
        status: "queued",
        idempotencyKey: idempotencyKey ?? null,
        createdById: admin.id,
      },
    });

    await logControllerAction({
      actor: admin,
      action: "controller.migration_job.enqueued",
      targetId: job.id,
      after: { migrationProfileId, sourceType: job.sourceType },
    });

    return NextResponse.json({ job }, { status: 201 });
  })) as NextResponse;
}

export async function GET(req: Request) {
  return (await withAuthErrors(async () => {
    await requireImplementationAdmin();

    const profileId = new URL(req.url).searchParams.get("profileId");
    if (!profileId) {
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const jobs = await prisma.migrationJob.findMany({
      where: { migrationProfileId: profileId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json({ jobs });
  })) as NextResponse;
}
