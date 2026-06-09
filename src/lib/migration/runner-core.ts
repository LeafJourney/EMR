/**
 * EMR-456 — Migration import runner: pure core.
 *
 * The DB-driven runner (runner.ts) is thin: it loads a MigrationJob, calls into
 * this module to decide where to resume and to process a batch of staged rows,
 * then checkpoints the counters back to the row. Everything that decides
 * *what* happens lives here, pure and unit-testable:
 *
 *   - planResume()   — where to pick up, given the persisted counters. This is
 *                      what makes a crashed import resumable: completed + failed
 *                      rows are never reprocessed.
 *   - processBatch() — run a window of rows through a handler, tallying
 *                      completed/failed and collecting the first few errors.
 *   - terminalStatus() — map the final tally onto the MigrationJobStatus enum.
 *
 * No I/O, no Date.now(). The DB layer supplies rows + timestamps.
 */

/** Shape staged into MigrationJob.sourcePayload by a source connector. */
export interface StagedPayload {
  category: string;
  rows: Array<Record<string, unknown>>;
}

export interface RowOutcome {
  ok: boolean;
  error?: string;
}

/** Maps one staged row to an outcome. Pure; throwing is caught by processBatch. */
export type RowHandler = (
  row: Record<string, unknown>,
  index: number,
) => RowOutcome;

export interface ResumePlan {
  /** First row index still to process (= completed + failed already counted). */
  offset: number;
  /** Rows left to process. */
  remaining: number;
  /** Total rows in the staged payload. */
  total: number;
  done: boolean;
}

export interface RowError {
  index: number;
  error: string;
}

export interface BatchResult {
  /** Rows handled this call. */
  processed: number;
  completed: number;
  failed: number;
  errors: RowError[];
}

export type MigrationTerminalStatus =
  | "completed"
  | "completed_with_errors"
  | "failed";

/**
 * Validate + coerce a raw JSON value (MigrationJob.sourcePayload) into the
 * staged-payload shape. Returns null for anything that isn't
 * `{ category: string, rows: object[] }`; non-object rows are dropped.
 */
export function parseStagedPayload(value: unknown): StagedPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.category !== "string" || !Array.isArray(obj.rows)) return null;
  const rows = obj.rows.filter(
    (r): r is Record<string, unknown> =>
      !!r && typeof r === "object" && !Array.isArray(r),
  );
  return { category: obj.category, rows };
}

/**
 * Decide where to resume. `processed` (completed + failed) rows are skipped, so
 * re-running a partially-imported job never double-applies a row. Counters are
 * clamped into [0, total] so a corrupt ledger can't produce a negative or
 * out-of-range offset.
 */
export function planResume(
  counters: { rowsCompleted: number; rowsFailed: number },
  total: number,
): ResumePlan {
  const processed = Math.min(
    total,
    Math.max(0, counters.rowsCompleted + counters.rowsFailed),
  );
  return {
    offset: processed,
    remaining: total - processed,
    total,
    done: processed >= total,
  };
}

/**
 * Process up to `count` rows starting at `startIndex`. A handler that throws is
 * recorded as a failed row (the import continues). At most `maxErrors` row
 * errors are retained for the job result.
 */
export function processBatch(
  rows: Array<Record<string, unknown>>,
  startIndex: number,
  count: number,
  handler: RowHandler,
  maxErrors = 20,
): BatchResult {
  let completed = 0;
  let failed = 0;
  const errors: RowError[] = [];
  const end = Math.min(rows.length, startIndex + count);

  for (let i = startIndex; i < end; i++) {
    let outcome: RowOutcome;
    try {
      outcome = handler(rows[i], i);
    } catch (err) {
      outcome = { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
    if (outcome.ok) {
      completed += 1;
    } else {
      failed += 1;
      if (errors.length < maxErrors) {
        errors.push({ index: i, error: outcome.error ?? "unknown error" });
      }
    }
  }

  return { processed: Math.max(0, end - startIndex), completed, failed, errors };
}

/** Map the final tally onto the terminal MigrationJobStatus. */
export function terminalStatus(
  failed: number,
  total: number,
): MigrationTerminalStatus {
  if (total === 0 || failed === 0) return "completed";
  if (failed >= total) return "failed";
  return "completed_with_errors";
}

/**
 * Default row handler (EMR-456 v1). Validates that a row is a non-empty object.
 * Strict per-category field mapping/transforms land with EMR-454; until then
 * the runner's job is the resumable orchestration, and real per-category sinks
 * are injected by callers. `category` is used in the error message and reserved
 * for that future mapping.
 */
export function makeValidatingHandler(category: string): RowHandler {
  return (row) => {
    if (!row || typeof row !== "object") {
      return { ok: false, error: `${category} row is not an object` };
    }
    if (Object.keys(row).length === 0) {
      return { ok: false, error: `empty ${category} row` };
    }
    return { ok: true };
  };
}
