// EMR-749 — Streaming CSV export utility for fleet-ops list views.
//
// Used by every super-admin list surface that needs to dump its currently
// filtered rows to CSV (Practices list, Audit log, Providers, Claims
// rollup, etc.). Centralising it here means:
//
//   - one place to fix the next time someone exports 100k rows and OOMs
//     the server (streaming is load-bearing — we hand the response a
//     ReadableStream and pull from the source iterable lazily),
//   - one column convention (human-readable headers, never internal
//     field names),
//   - one audit emission path (`super_admin.csv_export` to
//     `ControllerAuditLog`), so support engineers can grep across
//     exports for tenant-shaped questions.
//
// The audit row is written BEFORE the stream starts so a connection drop
// mid-stream still leaves a trail of who exported what.

import "server-only";

import { logControllerAction } from "@/lib/auth/audit-stub";
import type { AuthedUser } from "@/lib/auth/session";

/** Column accessor — pulls a single cell value out of a row. */
export type CsvAccessor<T> = (row: T) => string | number | null | undefined;

/** Tag a column's `get` function as the canonical `practice_id` accessor. */
const PRACTICE_ID_TAG = Symbol.for("emr.csv.practiceIdColumn");

/**
 * Column spec entry. `header` is the human-readable label that lands in
 * row 1 of the CSV. Internal field names never leak.
 */
export interface CsvColumn<T> {
  header: string;
  get: CsvAccessor<T>;
}

/**
 * Mark an accessor as the `practice_id` column. Use when the column's
 * header isn't a literal "Practice ID" but it still semantically carries
 * the tenant id (e.g. "Organization ID" on a Claims rollup).
 */
export function practiceIdColumn<T>(
  header: string,
  get: CsvAccessor<T>,
): CsvColumn<T> {
  const tagged = ((row: T) => get(row)) as CsvAccessor<T> & {
    [PRACTICE_ID_TAG]?: true;
  };
  tagged[PRACTICE_ID_TAG] = true;
  return { header, get: tagged };
}

function isPracticeIdColumn<T>(col: CsvColumn<T>): boolean {
  const headerNorm = col.header.trim().toLowerCase().replace(/[\s_-]+/g, " ");
  if (headerNorm === "practice id") return true;
  const tagged = col.get as CsvAccessor<T> & { [PRACTICE_ID_TAG]?: true };
  return tagged[PRACTICE_ID_TAG] === true;
}

export interface CsvAuditPayload {
  /** Entity kind being exported — e.g. "Practice", "Claim", "AuditLog". */
  entity: string;
  /** The filter parameters that were active on the source query. */
  filters: Record<string, unknown>;
  /**
   * Who is exporting. Required because every audit row must name an
   * actor. Callers normally pass `await requireSuperAdmin()` (or its
   * equivalent) straight through.
   */
  actor: Pick<AuthedUser, "id" | "email" | "roles" | "organizationId">;
}

export interface StreamCsvOptions<T> {
  /** Async iterable of typed rows. Prisma cursors satisfy this. */
  rows: AsyncIterable<T> | Iterable<T>;
  /** Column spec — header + accessor per column. Order is preserved. */
  columns: ReadonlyArray<CsvColumn<T>>;
  /** Filename stem. UTC date is appended automatically. */
  filename: string;
  /** Audit-on-export payload. Refused if absent. */
  audit: CsvAuditPayload;
  /**
   * Require at least one column to be the `practice_id` column. Default
   * true. A column qualifies if its header normalises to "practice id"
   * OR its accessor was tagged via `practiceIdColumn()`.
   */
  requirePracticeIdColumn?: boolean;
}

/**
 * RFC-4180 cell escape. Wraps a value in double quotes when it contains
 * a comma, quote, CR, or LF, and doubles any embedded quotes. `null` /
 * `undefined` collapse to the empty string. Numbers stringify normally.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  if (s.length === 0) return "";
  // Quoting trigger: comma, quote, CR, or LF.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function utcDateStamp(now: Date = new Date()): string {
  const y = now.getUTCFullYear().toString().padStart(4, "0");
  const m = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = now.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function renderHeader<T>(columns: ReadonlyArray<CsvColumn<T>>): string {
  return columns.map((c) => escapeCsvCell(c.header)).join(",") + "\r\n";
}

function getAsyncIterator<T>(
  source: AsyncIterable<T> | Iterable<T>,
): AsyncIterator<T> {
  const asAsync = source as AsyncIterable<T>;
  if (typeof asAsync[Symbol.asyncIterator] === "function") {
    return asAsync[Symbol.asyncIterator]();
  }
  const sync = (source as Iterable<T>)[Symbol.iterator]();
  return {
    next: () => Promise.resolve(sync.next()),
    return: sync.return
      ? (value) => Promise.resolve(sync.return!(value))
      : undefined,
    throw: sync.throw
      ? (err) => Promise.resolve(sync.throw!(err))
      : undefined,
  };
}

function renderRow<T>(row: T, columns: ReadonlyArray<CsvColumn<T>>): string {
  const cells: string[] = new Array(columns.length);
  for (let i = 0; i < columns.length; i++) {
    cells[i] = escapeCsvCell(columns[i].get(row));
  }
  return cells.join(",") + "\r\n";
}

/**
 * Build a streaming `text/csv` `Response`. Audit is emitted (and awaited)
 * BEFORE the stream begins — if the audit row can't be written we still
 * proceed (logControllerAction swallows its own failures with retries and
 * Sentry), but the call site has had its one chance to be on record.
 *
 * The stream pulls rows lazily from the source iterable, so a 100k-row
 * Prisma cursor never materialises in memory.
 */
export async function streamCsvResponse<T>(
  opts: StreamCsvOptions<T>,
): Promise<Response> {
  const {
    rows,
    columns,
    filename,
    audit,
    requirePracticeIdColumn = true,
  } = opts;

  if (!columns.length) {
    throw new Error("streamCsvResponse: columns spec must not be empty");
  }
  if (!audit || !audit.entity || !audit.actor) {
    throw new Error(
      "streamCsvResponse: audit { entity, actor, filters } is required",
    );
  }

  if (requirePracticeIdColumn) {
    const hasPracticeId = columns.some((c) => isPracticeIdColumn(c));
    if (!hasPracticeId) {
      throw new Error(
        'streamCsvResponse: columns spec must include a practice_id column ' +
          '(header "Practice ID" or wrap accessor with practiceIdColumn()). ' +
          "Pass requirePracticeIdColumn: false to opt out.",
      );
    }
  }

  await logControllerAction({
    actor: audit.actor,
    action: "super_admin.csv_export",
    targetId: audit.entity,
    after: {
      entity: audit.entity,
      filters: audit.filters,
      filename,
      columns: columns.map((c) => c.header),
    },
  });

  const encoder = new TextEncoder();
  const iterator = getAsyncIterator(rows);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(renderHeader(columns)));
    },
    async pull(controller) {
      // One row per pull. ReadableStream invokes `pull` whenever the
      // consumer has backpressure room; per-row enqueueing keeps memory
      // bounded regardless of source size.
      try {
        const next = await iterator.next();
        if (next.done) {
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(renderRow(next.value, columns)));
      } catch (err) {
        controller.error(err);
      }
    },
    async cancel(reason) {
      try {
        await iterator.return?.(reason);
      } catch {
        // Iterator cleanup is best-effort; the consumer already gave up.
      }
    },
  });

  const safeStem = filename.replace(/[^A-Za-z0-9._-]+/g, "-");
  const headers = new Headers({
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${safeStem}-${utcDateStamp()}.csv"`,
    "Cache-Control": "no-store",
  });

  return new Response(stream, { status: 200, headers });
}
