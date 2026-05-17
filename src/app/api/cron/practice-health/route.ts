// EMR-732 — Per-practice health scoring cron.
//
// Recomputes the `PracticeHealth` row for every live practice at
// most every 5 minutes. The HQ dashboard (E1) reads `score` and
// `breakdown` off the denormalized layer so request-time aggregates
// stay cheap.
//
// Auth posture mirrors `cron/coa-tracker` and `cron/credential-check`:
// Bearer `CRON_SECRET`, prod-only fail-closed, dev fall-through.
//
// Throughput: capped at 200 organizations per invocation to stay
// inside the platform request timeout. Render schedules this every
// minute; the per-practice cooldown (`PRACTICE_HEALTH_MIN_AGE_SECONDS`,
// default 300) prevents recompute thrash.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import { logControllerAction } from "@/lib/auth/audit-stub";
import { computePracticeHealth } from "@/lib/practice-health/scorer";

export const runtime = "nodejs";

const DEFAULT_MIN_AGE_SECONDS = 300; // 5 minutes
const BATCH_LIMIT = 200;

// System actor used for the audit row. The controller audit table
// requires an actor; the cron isn't a person, so we synthesize a
// stable system identity tagged with the `system` role.
const SYSTEM_ACTOR = {
  id: "system:cron:practice-health",
  email: "system@cron.practice-health",
  roles: ["system" as const],
  organizationId: null,
};

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization") ?? "";

  // Prod-only fail-closed: outside production we fall through so
  // local cron exercising doesn't need the secret. Matches the
  // pattern in cron/credential-check.
  if (process.env.NODE_ENV !== "production") return true;

  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const minAgeSeconds = Number(
    process.env.PRACTICE_HEALTH_MIN_AGE_SECONDS ?? DEFAULT_MIN_AGE_SECONDS,
  );
  const cooldownMs = (Number.isFinite(minAgeSeconds) ? minAgeSeconds : DEFAULT_MIN_AGE_SECONDS) * 1000;
  const cooldownCutoff = new Date(Date.now() - cooldownMs);

  try {
    // 1) Find live practices (published configs). One row per org —
    // dedupe at the cron-input layer so we don't double-score multi-config
    // orgs in a single sweep.
    const liveConfigs = await prisma.practiceConfiguration.findMany({
      where: { status: "published" },
      select: { organizationId: true },
      distinct: ["organizationId"],
      take: BATCH_LIMIT,
      orderBy: { updatedAt: "asc" }, // oldest first → most-stale practices score first
    });

    // 2) Pull existing PracticeHealth rows so we can skip ones that
    // were scored within the cooldown window.
    const orgIds = liveConfigs.map((c) => c.organizationId);
    const existing = await prisma.practiceHealth.findMany({
      where: { organizationId: { in: orgIds } },
      select: { organizationId: true, computedAt: true },
    });
    const lastComputedById = new Map<string, Date>();
    for (const row of existing) {
      lastComputedById.set(row.organizationId, row.computedAt);
    }

    let scored = 0;
    let skipped = 0;
    const scores: number[] = [];

    for (const { organizationId } of liveConfigs) {
      const lastComputed = lastComputedById.get(organizationId);
      if (lastComputed && lastComputed > cooldownCutoff) {
        skipped++;
        continue;
      }

      try {
        const { score, breakdown } = await computePracticeHealth(prisma, organizationId);
        await prisma.practiceHealth.upsert({
          where: { organizationId },
          create: { organizationId, score, breakdown },
          update: { score, breakdown, computedAt: new Date() },
        });
        scored++;
        scores.push(score);
      } catch (err) {
        // Single-practice failure shouldn't poison the whole sweep.
        logger.error({
          event: "cron.practice_health.score_failed",
          organizationId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const scanned = liveConfigs.length;
    const mean = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const min = scores.length ? Math.min(...scores) : null;
    const max = scores.length ? Math.max(...scores) : null;

    logger.info({
      event: "cron.practice_health.swept",
      scanned,
      scored,
      skipped,
      mean,
      min,
      max,
      durationMs: Date.now() - startedAt,
    });

    await logControllerAction({
      actor: SYSTEM_ACTOR,
      action: "controller.practice_health.swept",
      targetId: "cron:practice-health",
      after: { scanned, scored, skipped, mean, min, max },
    });

    return NextResponse.json({
      ok: true,
      scanned,
      scored,
      skipped,
      mean,
      min,
      max,
    });
  } catch (err) {
    logger.error({
      event: "cron.practice_health.failed",
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "practice-health sweep failed" },
      { status: 500 },
    );
  }
}
