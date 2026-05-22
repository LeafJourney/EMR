// EMR-730 — Per-actor mutation budget alarm cron.
//
// Why this exists: the per-bucket rate limiter (PR S, agent.* etc.)
// prevents abuse-via-volume on any single endpoint. But a compromised
// super_admin that *spreads* its mutations across many endpoints can
// stay under every individual bucket cap while still firing a
// catastrophic number of writes. This cron is the anomaly signal that
// says "this account is acting wrong" regardless of which buckets it
// touches.
//
// How it works:
//   1. Every ~60 seconds (cron cadence is wired in the deployment
//      scheduler — see render.yaml / Render dashboard), this route is
//      POSTed by the cron daemon with a Bearer CRON_SECRET header.
//   2. We read ControllerAuditLog for the trailing 5 minutes, grouped
//      per actor.
//   3. For each actor we compute two counts:
//        - perMin   = rows in the trailing 1 minute window
//        - per5Min  = rows in the trailing 5 minute window
//      If either exceeds its threshold (defaults: 30/min, 100/5min,
//      configurable via SUPER_ADMIN_ALARM_PER_{MIN,5MIN}), the actor is
//      a candidate for an alarm.
//   4. Dedupe: we read the most-recent MutationBudgetAlarm row for the
//      actor. If `lastAlertedAt` is within the last 10 minutes, we
//      *suppress* the new fire — but we still log the suppression so
//      on-call sees it on review. Otherwise we emit a structured
//      `logger.error` (event: `super_admin.mutation_budget_exceeded`)
//      that the log-aggregator routes to the incident channel, AND
//      we insert a new MutationBudgetAlarm row so the next sweep within
//      10 minutes dedupes.
//
// Tuning the thresholds:
//   - Set SUPER_ADMIN_ALARM_PER_MIN and SUPER_ADMIN_ALARM_PER_5MIN env
//     vars in Render. Values must be positive integers; anything
//     unparseable falls back to the default and logs a warning at the
//     next cron tick (event: `mutation_budget.threshold_unparseable`).
//
// Cost ceiling: query is bounded to the last 5 minutes (the largest
// window we care about) — never iterates the full table. Index used:
// ControllerAuditLog.at (implicit via the WHERE clause; the existing
// composite indexes on actorUserId+at also help the group-by).

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import { logControllerAction } from "@/lib/auth/audit-stub";
import {
  aggregatePerActor,
  DEDUPE_WINDOW_MS,
  exceedsBudget,
  isSuppressedByDedupe,
  loadThresholds,
  SWEEP_WINDOW_MS,
  type AuditRow,
} from "@/lib/security/mutation-budget";

export const runtime = "nodejs";

function isAuthorized(req: Request): boolean {
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";

  // Prod: fail-closed. If the secret is missing OR the header doesn't
  // match, reject. Same pattern as cron/credential-check and PR S.
  if (process.env.NODE_ENV === "production") {
    if (!secret) return false;
    return authHeader === `Bearer ${secret}`;
  }
  // Non-prod: fall through so local cron probing doesn't require an
  // env var. Matches cron/reminders + cron/credential-check.
  return true;
}

export async function POST(req: Request) {
  try {
    if (!isAuthorized(req)) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const now = new Date();
    const windowStart = new Date(now.getTime() - SWEEP_WINDOW_MS);
    const thresholds = loadThresholds(process.env, logger);

    // Pull the 5-minute window. `controller.%` matches every action the
    // controller surface emits via logControllerAction(). The same
    // prefix is the convention with-admin-mutation will inherit when it
    // lands (PR #343), so this filter is forward-compatible.
    const rows = (await prisma.controllerAuditLog.findMany({
      where: {
        at: { gte: windowStart },
        action: { startsWith: "controller." },
      },
      select: {
        at: true,
        actorUserId: true,
        actorEmail: true,
        action: true,
      },
    })) as AuditRow[];

    const perActor = aggregatePerActor(rows, now);

    let alarmsFired = 0;
    let suppressedByDedupe = 0;

    for (const counts of perActor.values()) {
      if (!exceedsBudget(counts, thresholds)) continue;

      // Look up the most-recent prior alarm for this actor.
      const prior = await prisma.mutationBudgetAlarm.findFirst({
        where: { actorUserId: counts.actorUserId },
        orderBy: { lastAlertedAt: "desc" },
        select: { lastAlertedAt: true, firstSeenAt: true },
      });

      if (isSuppressedByDedupe(prior?.lastAlertedAt ?? null, now)) {
        suppressedByDedupe += 1;
        logger.warn({
          event: "super_admin.mutation_budget_suppressed",
          actorUserId: counts.actorUserId,
          actorEmail: counts.actorEmail,
          perMin: counts.perMin,
          per5Min: counts.per5Min,
          lastAlertedAt: prior?.lastAlertedAt?.toISOString(),
          dedupeWindowMs: DEDUPE_WINDOW_MS,
        });
        continue;
      }

      // Fire the alarm. Structured logger.error → log-aggregator → incident channel.
      logger.error({
        event: "super_admin.mutation_budget_exceeded",
        actorUserId: counts.actorUserId,
        actorEmail: counts.actorEmail,
        perMin: counts.perMin,
        per5Min: counts.per5Min,
        thresholds,
        sampleActions: counts.sampleActions,
        revokeDeepLink: `/admin/console?actor=${counts.actorUserId}`,
      });

      // Persist the alarm row so subsequent sweeps within the dedupe
      // window can suppress. `firstSeenAt` carries forward from the
      // earliest prior fire on record, so the on-call view can see how
      // long this actor has been firing.
      await prisma.mutationBudgetAlarm.create({
        data: {
          actorUserId: counts.actorUserId,
          firstSeenAt: prior?.firstSeenAt ?? now,
          lastAlertedAt: now,
          perMinAtAlert: counts.perMin,
          per5MinAtAlert: counts.per5Min,
        },
      });

      alarmsFired += 1;
    }

    // Audit the sweep itself so the controller log has a record that
    // the alarm system actually ran (silence here would itself be a
    // failure mode worth seeing on review).
    await logControllerAction({
      actor: {
        id: "system:cron:mutation-budget",
        email: "system@cron.mutation-budget",
        roles: ["system"],
        organizationId: null,
      },
      action: "controller.mutation_budget.sweep_completed",
      targetId: "system:cron:mutation-budget",
      after: {
        actorsScanned: perActor.size,
        alarmsFired,
        suppressedByDedupe,
        thresholds,
      },
    });

    return NextResponse.json({
      ok: true,
      actorsScanned: perActor.size,
      alarmsFired,
      suppressedByDedupe,
    });
  } catch (error) {
    logger.error({ event: "cron.mutation_budget_sweep.failed", error });
    return NextResponse.json({ error: "sweep_failed" }, { status: 500 });
  }
}
