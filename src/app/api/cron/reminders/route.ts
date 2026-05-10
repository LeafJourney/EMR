// /api/cron/reminders
//
// Inbound cron tick (Render background worker or Vercel Cron). Looks at
// encounters scheduled in the 24-48h window and emits reminder messages.
//
// Auth model: shared-secret in the Authorization header. Production
// requires a match against CRON_SECRET — fail closed. Non-production
// allows any header (dev convenience) but logs the call so it's visible
// in dev tooling. There is no fallback default secret in code; CRON_SECRET
// must be set in any env where this route is callable.
//
// Per docs/security/route-auth.yaml — auth: needs_review (review_due
// 2026-05-16). This file ALSO previously carried `@ts-nocheck`. This PR
// burns down the `@ts-nocheck` and tightens the secret check; the
// review-due ticket can decide whether to additionally require Vercel's
// CRON_SECRET injection or move to a queue-based scheduler.

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REMINDER_BATCH_CAP = 500;

/**
 * Shape of the JSON we read from / write back to Encounter.briefingContext.
 * Stored as Prisma.JsonValue at rest, but the cron only cares about a
 * single `reminderSentAt` field.
 */
type BriefingContext = Record<string, unknown> & {
  reminderSentAt?: string;
};

function readBriefingContext(value: Prisma.JsonValue | null): BriefingContext {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as BriefingContext;
  }
  return {};
}

export async function GET(req: Request) {
  // Auth: production must validate the secret. Non-prod logs and falls
  // through so dev tooling can hit the route without the env var.
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  const expected = secret ? `Bearer ${secret}` : null;

  if (process.env.NODE_ENV === "production") {
    if (!expected || authHeader !== expected) {
      return new NextResponse("Unauthorized", { status: 401 });
    }
  } else if (!expected || authHeader !== expected) {
    // Dev: accept but log. Helps catch "we shipped to staging without
    // setting CRON_SECRET" before it bites prod.
    // eslint-disable-next-line no-console
    logger.warn({ event: "cron.reminders.dev_bypass" });
  }

  // Find appointments scheduled between 24 and 48 hours from now
  const tomorrowStart = new Date();
  tomorrowStart.setHours(tomorrowStart.getHours() + 24);

  const tomorrowEnd = new Date();
  tomorrowEnd.setHours(tomorrowEnd.getHours() + 48);

  try {
    // Cap the read — a busy multi-org cron should not pull every
    // scheduled encounter into one Lambda. Above this cap, ops needs to
    // know the cron is over budget.
    const upcomingEncounters = await prisma.encounter.findMany({
      where: {
        status: "scheduled",
        scheduledFor: {
          gte: tomorrowStart,
          lt: tomorrowEnd,
        },
      },
      include: {
        patient: {
          select: {
            firstName: true,
            email: true,
            phone: true,
          },
        },
        // Provider rows don't carry firstName/lastName directly — those
        // live on the related User (Provider.user). Reach through.
        provider: {
          select: {
            user: {
              select: {
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      take: REMINDER_BATCH_CAP,
    });

    if (upcomingEncounters.length === REMINDER_BATCH_CAP) {
      // eslint-disable-next-line no-console
      console.warn(
        `[cron/reminders] batch hit cap (${REMINDER_BATCH_CAP}) — tail of window may be skipped this run`,
      );
    }

    let sentCount = 0;

    for (const encounter of upcomingEncounters) {
      if (!encounter.scheduledFor) continue;
      if (!encounter.patient?.email) continue;

      const scheduledFor = encounter.scheduledFor;
      const timeString = scheduledFor.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
      });
      const providerLastName = encounter.provider?.user?.lastName ?? null;
      const providerName = providerLastName
        ? `Dr. ${providerLastName}`
        : "your care provider";
      const modalityText =
        encounter.modality === "video"
          ? "telehealth video"
          : encounter.modality === "phone"
            ? "phone"
            : "in-person";

      // TODO(EMR-XXX): replace with the real Twilio/SendGrid path once
      // the messaging-provider abstraction lands. For now this is a
      // structured log line so ops can verify the cron is firing
      // against the right rows.
      // eslint-disable-next-line no-console
      console.log(
        `[cron/reminders] would-send to=${encounter.patient.email} ` +
          `firstName=${encounter.patient.firstName ?? ""} ` +
          `at=${timeString} provider=${providerName} modality=${modalityText}`,
      );

      const currentContext = readBriefingContext(encounter.briefingContext);
      await prisma.encounter.update({
        where: { id: encounter.id },
        data: {
          briefingContext: {
            ...currentContext,
            reminderSentAt: new Date().toISOString(),
          },
        },
      });

      sentCount++;
    }

    return NextResponse.json({
      success: true,
      processed: upcomingEncounters.length,
      sent: sentCount,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    logger.error({ event: "cron.reminders.failed", err: error });
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
