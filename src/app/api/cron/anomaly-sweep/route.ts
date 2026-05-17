// EMR-734 — Anomaly detector sweep cron.
//
// Runs the registered anomaly detectors and applies their emissions to
// the `Anomaly` table. See src/lib/anomaly/framework.ts for the full
// lifecycle contract (idempotent re-emission, auto-resolve, TTL expiry).
//
// Auth: Bearer CRON_SECRET, prod-only fail-closed — non-prod environments
// fall through so dev/staging can exercise the handler without a real
// secret. Matches the established pattern in cron/audit-export and
// cron/credential-check. Manifest entry: cron/anomaly-sweep → auth=cron.
//
// Registry: starts empty in this PR. Concrete detectors register
// themselves at module import time from src/lib/anomaly/registry.ts.
// EMR-737 / EMR-740 / EMR-741 fill the registry.
//
// Audit: emits exactly one `controller.anomaly_sweep.completed` row per
// sweep via logControllerAction. Metadata captures detectors run, total
// emissions, new rows opened, auto-resolved rows, and ttl-expired rows.
// The synthetic actor is `system:cron:anomaly-sweep`.

import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import { logControllerAction } from "@/lib/auth/audit-stub";
import {
  applyEmissions,
  getRegisteredDetectors,
} from "@/lib/anomaly/framework";
// Importing the registry module triggers side-effecting detector
// registrations (none yet — see comment in registry.ts). Keep this
// import even when the registry is empty so the wiring is in place for
// EMR-737/740/741 to drop their detectors in.
import "@/lib/anomaly/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Synthetic actor identity for the controller audit row that records the
// sweep run itself. The `system:cron:*` namespace is reserved for
// unattended automation — not a real user id.
const SYSTEM_ACTOR_ID = "system:cron:anomaly-sweep";
const SYSTEM_ACTOR_EMAIL = "system@leafjourney.internal";

export async function POST(req: Request): Promise<NextResponse> {
  // ── Auth gate ────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const detectors = getRegisteredDetectors();

  logger.info({
    event: "cron.anomaly_sweep.started",
    detectorsRegistered: detectors.length,
  });

  let emissionsTotal = 0;
  let newOpened = 0;
  let autoResolved = 0;
  let ttlExpired = 0;
  const perDetector: Array<{
    slug: string;
    emissions: number;
    newOpened: number;
    reaffirmed: number;
    autoResolved: number;
    ttlExpired: number;
    error?: string;
  }> = [];

  for (const detector of detectors) {
    try {
      const emissions = await detector.run(prisma);
      const result = await applyEmissions(prisma, detector.slug, emissions, now);
      emissionsTotal += emissions.length;
      newOpened += result.newOpened;
      autoResolved += result.autoResolved;
      ttlExpired += result.ttlExpired;
      perDetector.push({
        slug: detector.slug,
        emissions: emissions.length,
        newOpened: result.newOpened,
        reaffirmed: result.reaffirmed,
        autoResolved: result.autoResolved,
        ttlExpired: result.ttlExpired,
      });
    } catch (err) {
      // One bad detector must not bring down the whole sweep — the rest
      // of the detectors keep running. We capture the failure in the
      // per-detector breakdown so the audit row + structured log show
      // exactly which one fell over.
      const message = err instanceof Error ? err.message : String(err);
      perDetector.push({
        slug: detector.slug,
        emissions: 0,
        newOpened: 0,
        reaffirmed: 0,
        autoResolved: 0,
        ttlExpired: 0,
        error: message,
      });
      logger.error({
        event: "cron.anomaly_sweep.detector_failed",
        detectorSlug: detector.slug,
        err:
          err instanceof Error
            ? { name: err.name, message: err.message, stack: err.stack }
            : String(err),
      });
    }
  }

  // ── Emit one audit row per sweep ────────────────────────
  // targetId is "all" when no detectors ran — gives the audit trail a
  // stable subjectId even on empty registries (current state in this
  // PR; registry fills in EMR-737/740/741).
  await logControllerAction({
    actor: {
      id: SYSTEM_ACTOR_ID,
      email: SYSTEM_ACTOR_EMAIL,
      roles: ["system"],
      organizationId: null,
    },
    action: "controller.anomaly_sweep.completed",
    targetId: "anomaly-sweep",
    after: {
      detectorsRun: detectors.length,
      emissionsTotal,
      newOpened,
      autoResolved,
      ttlExpired,
      perDetector,
    },
    reason: "Anomaly detector sweep",
  });

  const durationMs = Date.now() - startedAt;
  logger.info({
    event: "cron.anomaly_sweep.completed",
    detectorsRun: detectors.length,
    emissionsTotal,
    newOpened,
    autoResolved,
    ttlExpired,
    durationMs,
  });

  return NextResponse.json({
    success: true,
    detectorsRun: detectors.length,
    emissionsTotal,
    newOpened,
    autoResolved,
    ttlExpired,
    perDetector,
  });
}
