// EMR-456 — Migration import job runner (server-side, DB-driven).
//
// Drives a MigrationJob from `queued`/`running` to a terminal state by
// processing the staged rows in MigrationJob.sourcePayload through a row
// handler in checkpointed batches. After every batch the rowsCompleted /
// rowsFailed counters are persisted, so a crashed (or cron-interrupted) import
// resumes from exactly where it left off — completed + failed rows are never
// reprocessed (see runner-core.planResume).
//
// v1 ships the resumable orchestration with a validating default handler;
// strict per-category field mapping (EMR-454) and real clinical-table sinks are
// injected by the caller via `opts.handler`. The cron entry point
// (runQueuedMigrationJobs) processes jobs sequentially, so a single tick is
// at-most-once per job; overlapping ticks are avoided by cadence, not a lock.

import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import {
  type RowError,
  type RowHandler,
  makeValidatingHandler,
  parseStagedPayload,
  planResume,
  processBatch,
  terminalStatus,
} from "./runner-core";

const DEFAULT_BATCH_SIZE = 200;

export interface RunMigrationJobResult {
  ok: boolean;
  jobId: string;
  status?: string;
  skipped?: boolean;
  completed?: number;
  failed?: number;
  reason?: string;
}

export interface RunMigrationJobOptions {
  /** Override the per-row sink (e.g. a real per-category importer). */
  handler?: RowHandler;
  batchSize?: number;
}

/** Run (or resume) a single migration job to a terminal state. */
export async function runMigrationJob(
  jobId: string,
  opts: RunMigrationJobOptions = {},
): Promise<RunMigrationJobResult> {
  const job = await prisma.migrationJob.findUnique({ where: { id: jobId } });
  if (!job) return { ok: false, jobId, reason: "not_found" };

  // Already terminal — nothing to do (idempotent re-run).
  if (
    job.status === "completed" ||
    job.status === "completed_with_errors" ||
    job.status === "failed" ||
    job.status === "cancelled"
  ) {
    return { ok: true, jobId, skipped: true, status: job.status };
  }

  const payload = parseStagedPayload(job.sourcePayload);
  if (!payload) {
    await prisma.migrationJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: "no_or_invalid_source_payload",
        completedAt: new Date(),
      },
    });
    return { ok: false, jobId, status: "failed", reason: "no_source_payload" };
  }

  const total = payload.rows.length;
  const batchSize = Math.max(1, opts.batchSize ?? DEFAULT_BATCH_SIZE);
  const handler = opts.handler ?? makeValidatingHandler(payload.category);

  // Transition to running; stamp startedAt only on the first pass; sync
  // rowsTotal to the staged payload so the progress UI is accurate on resume.
  await prisma.migrationJob.update({
    where: { id: jobId },
    data: {
      status: "running",
      startedAt: job.startedAt ?? new Date(),
      rowsTotal: total,
    },
  });

  let completed = job.rowsCompleted;
  let failed = job.rowsFailed;
  const errors: RowError[] = [];

  // Resume from the persisted offset, then process in checkpointed batches.
  let plan = planResume({ rowsCompleted: completed, rowsFailed: failed }, total);
  while (!plan.done) {
    const batch = processBatch(payload.rows, plan.offset, batchSize, handler);
    if (batch.processed === 0) break; // safety: never spin
    completed += batch.completed;
    failed += batch.failed;
    for (const e of batch.errors) {
      if (errors.length < 20) errors.push(e);
    }

    // Checkpoint — the durable resume point.
    await prisma.migrationJob.update({
      where: { id: jobId },
      data: { rowsCompleted: completed, rowsFailed: failed },
    });

    plan = planResume({ rowsCompleted: completed, rowsFailed: failed }, total);
  }

  const status = terminalStatus(failed, total);
  await prisma.migrationJob.update({
    where: { id: jobId },
    data: {
      status,
      completedAt: new Date(),
      error: status === "failed" ? "all_rows_failed" : null,
      result: {
        category: payload.category,
        total,
        completed,
        failed,
        errors: errors.slice(0, 20),
      } as unknown as Prisma.InputJsonValue,
    },
  });

  logger.info({
    event: "migration.job.completed",
    jobId,
    status,
    total,
    completed,
    failed,
  });

  return { ok: true, jobId, status, completed, failed };
}

/**
 * Cron entry point: drain queued (and resume in-flight) jobs, oldest first.
 * Sequential by design — see file header on the at-most-once-per-tick contract.
 */
export async function runQueuedMigrationJobs(
  limit = 5,
): Promise<RunMigrationJobResult[]> {
  const jobs = await prisma.migrationJob.findMany({
    where: { status: { in: ["queued", "running"] } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });

  const results: RunMigrationJobResult[] = [];
  for (const j of jobs) {
    try {
      results.push(await runMigrationJob(j.id));
    } catch (err) {
      logger.error({
        event: "migration.job.failed",
        jobId: j.id,
        err: err instanceof Error ? err.message : String(err),
      });
      results.push({
        ok: false,
        jobId: j.id,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return results;
}
