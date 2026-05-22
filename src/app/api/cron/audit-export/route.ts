// EMR-750 — Daily JSONL audit export to object storage.
//
// Each night this cron handler exports the previous UTC calendar day's
// ControllerAuditLog rows to object storage as a single gzipped JSONL
// artefact. Compliance review reads from that immutable artefact instead
// of running ad-hoc DB queries against the live audit table.
//
// Auth: Bearer CRON_SECRET, prod-only fail-closed — non-prod environments
// fall through so dev/staging can exercise the handler without a real
// secret. Matches the established pattern in cron/credential-check and
// cron/cs-reconciliation. Manifest entry: cron/audit-export → auth=cron.
//
// Object key: audit/controller/YYYY/MM/DD.jsonl.gz where YYYY/MM/DD is
// the UTC day being exported (yesterday at run time).
//
// Streaming shape: we page the ControllerAuditLog table with a cursor,
// JSON-serialise each row to a single line (no embedded newlines), feed
// the lines into a Node `zlib.createGzip()` stream, and collect the
// compressed output into a buffer. We then upload that buffer atomically
// to storage in one put — the AC explicitly forbids partial writes, so
// the buffer is the assembly point. We never hold all the raw rows in
// memory at once; only the compressed bytes (which gzip squashes hard
// for JSONL of this shape).
//
// Idempotency: ControllerAuditExport.coveredDate is unique. Re-running
// for the same day overwrites the storage object at the same key and
// upserts the ledger row with fresh row/byte/sha256 stats.
//
// Audit: on success we emit a `super_admin.audit_export` row via
// logControllerAction so the export itself shows up in the audit trail.
// The synthetic actor is `actorUserId: "system:cron:audit-export"`.
//
// Failure: structured error log + 500. The intended alarm wiring is an
// incident-channel notifier (Sentry → PagerDuty / Slack) downstream of
// `logger.error` — at the time of writing this repo has no first-party
// alarm helper, so we lean on the existing observability log. When that
// helper lands, swap the `logger.error` call here for it.

import { NextResponse } from "next/server";
import { createGzip } from "node:zlib";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";

import type { ControllerAuditLog } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import { getStorageBackend } from "@/lib/marketplace/document-storage";
import { logControllerAction } from "@/lib/auth/audit-stub";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Page size for the Prisma cursor walk. Tuned to keep the working-set
// row buffer small (we only hold one page in memory at a time before
// feeding into the gzip stream).
const PAGE_SIZE = 500;

// Synthetic actor identity for the controller audit row that records
// the export run itself. The actorUserId namespace `system:cron:*` is
// reserved for unattended automation; it is not a real user id.
const SYSTEM_ACTOR_ID = "system:cron:audit-export";
const SYSTEM_ACTOR_EMAIL = "system@leafjourney.internal";

/**
 * Compute the UTC midnight boundaries for "yesterday" relative to `now`.
 * Returns the inclusive start and exclusive end of the covered day, plus
 * the YYYY/MM/DD path segments used in the storage key.
 */
function previousUtcDay(now: Date): {
  start: Date;
  end: Date;
  year: string;
  month: string;
  day: string;
  isoDate: string;
} {
  const todayUtcMidnight = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const start = new Date(todayUtcMidnight.getTime() - 24 * 60 * 60 * 1000);
  const end = todayUtcMidnight;
  const year = String(start.getUTCFullYear());
  const month = String(start.getUTCMonth() + 1).padStart(2, "0");
  const day = String(start.getUTCDate()).padStart(2, "0");
  return { start, end, year, month, day, isoDate: `${year}-${month}-${day}` };
}

/**
 * Walk ControllerAuditLog rows for the given window in stable id order,
 * yielding one JSON line at a time (newline-terminated). Cursor-paginated
 * so we never load a full day into memory.
 *
 * One JSON line per row; we use a custom replacer that ensures the JSON
 * itself contains no literal newline characters (Date objects already
 * serialise without newlines; strings get escaped by JSON.stringify).
 */
async function* iterateAuditLines(
  start: Date,
  end: Date,
): AsyncGenerator<string, { rowCount: number }, void> {
  let cursor: string | null = null;
  let rowCount = 0;

  // Sentinel return is unreachable through the for-await consumer, but
  // TypeScript can't see that — the explicit return type matches the
  // success return from the loop body below.

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page: ControllerAuditLog[] = cursor
      ? await prisma.controllerAuditLog.findMany({
          where: { at: { gte: start, lt: end } },
          orderBy: [{ id: "asc" }],
          take: PAGE_SIZE,
          skip: 1,
          cursor: { id: cursor },
        })
      : await prisma.controllerAuditLog.findMany({
          where: { at: { gte: start, lt: end } },
          orderBy: [{ id: "asc" }],
          take: PAGE_SIZE,
        });

    if (page.length === 0) {
      return { rowCount };
    }

    for (const row of page) {
      // JSON.stringify already escapes embedded newlines in strings; Date
      // objects serialise to ISO strings without newlines. The "+ \n"
      // is the JSONL record separator.
      yield JSON.stringify(row) + "\n";
      rowCount++;
    }

    cursor = page[page.length - 1].id;
    if (page.length < PAGE_SIZE) {
      return { rowCount };
    }
  }
}

/**
 * Drive the row iterator through a gzip stream, collect the compressed
 * bytes into a single Buffer, and compute the SHA-256 of the compressed
 * output along the way. We collect because the storage backend's `put`
 * takes a Buffer and the AC mandates a single atomic upload — but we
 * never buffer the raw (uncompressed) rows.
 */
async function buildGzippedExport(
  start: Date,
  end: Date,
): Promise<{ buffer: Buffer; rowCount: number; byteCount: number; sha256: string }> {
  let rowCount = 0;
  const hasher = createHash("sha256");
  const chunks: Buffer[] = [];

  // Source: an async iterable of UTF-8 JSONL strings, one per audit row.
  // Readable.from is happy to consume a string async-iterable directly,
  // encoding each chunk as UTF-8 by default.
  const source = Readable.from(
    (async function* () {
      for await (const line of iterateAuditLines(start, end)) {
        rowCount++;
        yield line;
      }
    })(),
    { objectMode: false, encoding: "utf8" },
  );

  const gzip = createGzip();

  source.on("error", (err) => gzip.destroy(err));

  await new Promise<void>((resolve, reject) => {
    gzip.on("data", (chunk: Buffer) => {
      hasher.update(chunk);
      chunks.push(chunk);
    });
    gzip.on("end", resolve);
    gzip.on("error", reject);
    source.pipe(gzip);
  });

  const buffer = Buffer.concat(chunks);
  return {
    buffer,
    rowCount,
    byteCount: buffer.byteLength,
    sha256: hasher.digest("hex"),
  };
}

export async function POST(req: Request): Promise<NextResponse> {
  // ── Auth gate ────────────────────────────────────────────
  const authHeader = req.headers.get("authorization") ?? "";
  const secret = process.env.CRON_SECRET ?? "";
  if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const startedAt = Date.now();
  const now = new Date();
  const { start, end, year, month, day, isoDate } = previousUtcDay(now);
  const storageKey = `audit/controller/${year}/${month}/${day}.jsonl.gz`;

  logger.info({
    event: "cron.audit_export.started",
    coveredDate: isoDate,
    storageKey,
  });

  try {
    // ── Assemble the gzipped JSONL ─────────────────────────
    const { buffer, rowCount, byteCount, sha256 } = await buildGzippedExport(start, end);

    // ── Upload to object storage ───────────────────────────
    // The storage backend is the established marketplace document
    // backend (local-fs in dev, S3 in prod once wired). The bucket
    // lifecycle policy applies the retention class — no per-object
    // retention code lives in the app, per the AC.
    const backend = getStorageBackend();
    const putResult = await backend.put(storageKey, buffer);

    // ── Upsert verification ledger row ─────────────────────
    await prisma.controllerAuditExport.upsert({
      where: { coveredDate: start },
      create: {
        coveredDate: start,
        storageKey: putResult.storageKey,
        rowCount,
        byteCount,
        sha256,
      },
      update: {
        storageKey: putResult.storageKey,
        rowCount,
        byteCount,
        sha256,
        runAt: new Date(),
      },
    });

    // ── Emit success audit row ─────────────────────────────
    await logControllerAction({
      actor: {
        id: SYSTEM_ACTOR_ID,
        email: SYSTEM_ACTOR_EMAIL,
        roles: ["system"],
        organizationId: null,
      },
      action: "super_admin.audit_export",
      targetId: storageKey,
      after: {
        coveredDate: isoDate,
        storageKey: putResult.storageKey,
        rowCount,
        byteCount,
        sha256,
        windowStart: start.toISOString(),
        windowEnd: end.toISOString(),
      },
      reason: "Daily ControllerAuditLog JSONL export",
    });

    const durationMs = Date.now() - startedAt;
    logger.info({
      event: "cron.audit_export.completed",
      coveredDate: isoDate,
      storageKey: putResult.storageKey,
      rowCount,
      byteCount,
      sha256,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      coveredDate: isoDate,
      storageKey: putResult.storageKey,
      rowCount,
      byteCount,
      sha256,
    });
  } catch (err) {
    // Failure path: structured error log. Sentry picks this up via the
    // observability layer; PagerDuty/Slack incident routing is wired
    // downstream of Sentry. There is no first-party alarm helper in this
    // repo yet — when one lands (`src/lib/observability/alarm.ts` or
    // similar), swap this `logger.error` for a direct call. The
    // ControllerAuditExport row is ALSO the absence-signal: a missing
    // row for an expected date is itself an alarm condition.
    const message = err instanceof Error ? err.message : String(err);
    logger.error({
      event: "cron.audit_export.failed",
      coveredDate: isoDate,
      storageKey,
      err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(
      { error: "audit_export_failed", message },
      { status: 500 },
    );
  }
}
