// EMR-456 — Migration import runner cron.
//
// Drains queued (and resumes in-flight) MigrationJob rows, processing the
// staged source rows in checkpointed batches. The actual row-by-row work +
// resume logic lives in src/lib/migration/runner; this route is the scheduled
// trigger. Auth: Bearer CRON_SECRET (production), matching the other crons.

import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/log";
import { runQueuedMigrationJobs } from "@/lib/migration/runner";

export const runtime = "nodejs";

/** Max jobs to advance per tick — keeps a single invocation bounded. */
const JOBS_PER_TICK = 5;

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

    logger.info({ event: "cron.migration_runner.started" });
    const results = await runQueuedMigrationJobs(JOBS_PER_TICK);
    logger.info({
      event: "cron.migration_runner.completed",
      jobsProcessed: results.length,
    });

    return NextResponse.json({ success: true, jobsProcessed: results.length, results });
  } catch (error) {
    logger.error({ event: "cron.migration_runner.failed", error });
    return NextResponse.json(
      { error: "Failed to run migration jobs" },
      { status: 500 },
    );
  }
}
