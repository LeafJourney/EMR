// EMR-633 — HIPAA Privacy & Breach Notification cron.
//
// Scans recent `patient.phi_accessed` audit events for actors who read an
// unusually large number of distinct patient charts in a short window
// (snooping / scripted scrape / compromised account). Each finding becomes a
// deduplicated compliance Task plus a `compliance.breach.suspected` audit row,
// so privacy staff get an auto-alert instead of having to comb the audit log.
//
// The detection math is pure (src/lib/compliance/breach-detection); this route
// is the scheduled trigger + persistence. Auth: Bearer CRON_SECRET (production).

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import {
  type BroadAccessFinding,
  detectBroadAccess,
} from "@/lib/compliance/breach-detection";

const DAY_MS = 86_400_000;
const DEFAULT_WINDOW_MINUTES = 60;
const DEFAULT_THRESHOLD = 50;
const EVENT_CAP = 50_000;

function clampInt(raw: string | null, def: number, lo: number, hi: number): number {
  const n = raw == null ? def : Number(raw);
  if (!Number.isFinite(n)) return def;
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

/** Create an open Task unless an identical one was opened in the last 24h. */
async function ensureTask(
  organizationId: string,
  title: string,
  description: string,
): Promise<boolean> {
  const since = new Date(Date.now() - DAY_MS);
  const existing = await prisma.task.findFirst({
    where: { organizationId, title, status: "open", createdAt: { gte: since } },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.task.create({
    data: {
      organizationId,
      title,
      description,
      status: "open",
      assigneeRole: "practice_admin",
    },
  });
  return true;
}

async function recordBreachAudit(finding: BroadAccessFinding): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: finding.organizationId,
        actorAgent: "system:breach-watch",
        action: "compliance.breach.suspected",
        subjectType: "User",
        subjectId: finding.actorUserId,
        metadata: {
          distinctPatients: finding.distinctPatients,
          totalReads: finding.totalReads,
          threshold: finding.threshold,
          windowStart: finding.windowStartIso,
          windowEnd: finding.windowEndIso,
        } as Prisma.InputJsonValue,
      },
    });
  } catch {
    // An audit miss must not abort the alerting run.
  }
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    if (
      process.env.NODE_ENV === "production" &&
      authHeader !== `Bearer ${secret}`
    ) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const params = new URL(req.url).searchParams;
    const windowMinutes = clampInt(
      params.get("windowMinutes"),
      DEFAULT_WINDOW_MINUTES,
      5,
      24 * 60,
    );
    const threshold = clampInt(params.get("threshold"), DEFAULT_THRESHOLD, 5, 5000);

    const now = new Date();
    const windowMs = windowMinutes * 60_000;
    const since = new Date(now.getTime() - windowMs);

    logger.info({ event: "cron.breach_watch.started", windowMinutes, threshold });

    const events = await prisma.auditLog.findMany({
      where: { action: "patient.phi_accessed", createdAt: { gte: since } },
      select: {
        organizationId: true,
        actorUserId: true,
        subjectId: true,
        createdAt: true,
      },
      take: EVENT_CAP,
    });

    const findings = detectBroadAccess(events, {
      now,
      windowMs,
      distinctPatientThreshold: threshold,
    });

    let tasksCreated = 0;
    for (const f of findings) {
      try {
        const title = `[Privacy] Possible broad PHI access — user ${f.actorUserId}`;
        const description =
          `User ${f.actorUserId} accessed ${f.distinctPatients} distinct patient ` +
          `charts (${f.totalReads} reads) in the last ${windowMinutes} min, at or ` +
          `above the ${f.threshold}-patient alert threshold. Review for a possible ` +
          `HIPAA privacy breach and confirm the access was permissible.`;
        await recordBreachAudit(f);
        if (await ensureTask(f.organizationId, title, description)) {
          tasksCreated += 1;
        }
      } catch (err) {
        logger.error({
          event: "cron.breach_watch.finding_failed",
          actorUserId: f.actorUserId,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    logger.info({
      event: "cron.breach_watch.completed",
      eventsScanned: events.length,
      findings: findings.length,
      tasksCreated,
    });

    return NextResponse.json({
      success: true,
      eventsScanned: events.length,
      findings: findings.length,
      tasksCreated,
    });
  } catch (error) {
    logger.error({ event: "cron.breach_watch.failed", error });
    return NextResponse.json(
      { error: "Failed to run breach watch" },
      { status: 500 },
    );
  }
}
