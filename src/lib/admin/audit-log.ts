// EMR-747 — Cross-actor ControllerAuditLog query core.
//
// Pure functions that take a prisma-shaped client and return filtered audit
// rows. Exported separately from the API route so it can be unit-tested
// with a fake prisma without booting Next.js.
//
// Filter surface mirrors the URL/API contract:
//   - actor   — exact match on actorUserId, OR "system:<name>" prefix when
//               the controller surface emitted the row as a system actor
//               (kept as substring on actorEmail for now — see
//               TODO(EMR-747-system-actor)).
//   - action  — case-insensitive `contains` on the action string. Operators
//               type "publish" to find every "*.publish.*" row regardless
//               of namespace.
//   - target  — exact match on subjectId OR organizationId. Operators paste
//               either a practice id or a user id; we don't make them pick.
//   - from/to — half-open `at` range. `to` is exclusive so a date-only "to"
//               of 2026-05-17 doesn't accidentally drop rows that happened
//               at 23:59:59.5 UTC.
//
// Cursor pagination is keyed on the (at, id) pair. Audit volume is
// dominated by ingest bursts — two rows in the same ms is normal — so
// `at`-only cursors would skip rows. We persist both fields in the cursor
// and use a tie-break on `id` to keep page boundaries deterministic.
//
// Default sort is `at DESC, id DESC`. v1 has no other sort options (per AC).

import "server-only";

import type { Prisma } from "@prisma/client";

export const AUDIT_DEFAULT_LIMIT = 50;
export const AUDIT_MAX_LIMIT = 200;

/** Shape of a ControllerAuditLog row as it crosses the API. */
export interface AuditRow {
  id: string;
  at: string; // ISO
  actorUserId: string;
  actorEmail: string | null;
  actorRoles: string[];
  organizationId: string | null;
  action: string;
  subjectType: string;
  subjectId: string;
  before: unknown;
  after: unknown;
  reason: string | null;
}

/** Parsed filter set — used by both the list and export routes. */
export interface AuditQuery {
  actor: string | null;
  action: string | null;
  target: string | null;
  from: Date | null;
  to: Date | null;
  cursor: AuditCursor | null;
  limit: number;
}

export interface AuditCursor {
  at: string; // ISO timestamp of the last row on the previous page
  id: string; // tie-break id of the last row on the previous page
}

/** Minimal Prisma subset we depend on — keeps unit tests fake-friendly. */
export interface AuditPrisma {
  controllerAuditLog: {
    findMany: (args: Prisma.ControllerAuditLogFindManyArgs) => Promise<
      Array<{
        id: string;
        at: Date;
        actorUserId: string;
        actorEmail: string | null;
        actorRoles: string[];
        organizationId: string | null;
        action: string;
        subjectType: string;
        subjectId: string;
        before: unknown;
        after: unknown;
        reason: string | null;
      }>
    >;
  };
}

/** Encode a cursor for safe URL transport. base64url-of-JSON. */
export function encodeCursor(cursor: AuditCursor): string {
  const json = JSON.stringify(cursor);
  // Buffer is available in the Node runtime that hosts both the page and
  // the API route. We base64url-encode so the cursor survives a copy/paste
  // into a URL without re-quoting.
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Decode a cursor produced by `encodeCursor`. Returns null on any error. */
export function decodeCursor(raw: string | null | undefined): AuditCursor | null {
  if (!raw) return null;
  try {
    const padded = raw.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as Partial<AuditCursor>;
    if (
      parsed &&
      typeof parsed.at === "string" &&
      typeof parsed.id === "string"
    ) {
      // Verify `at` parses as a real date; reject otherwise.
      const t = Date.parse(parsed.at);
      if (Number.isFinite(t)) {
        return { at: parsed.at, id: parsed.id };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/** Coerce a `limit` URL param into the allowed range. */
export function parseLimit(raw: string | null | undefined): number {
  if (!raw) return AUDIT_DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return AUDIT_DEFAULT_LIMIT;
  return Math.min(n, AUDIT_MAX_LIMIT);
}

/** Parse an ISO date or date-time string. Returns null on any failure. */
export function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

/**
 * Parse a Web URLSearchParams (or a Record<string,string>) into an
 * `AuditQuery`. Used by both the API route (URL) and the page (server
 * component searchParams). One function so the round-trip is identical.
 */
export function parseAuditQuery(
  params:
    | URLSearchParams
    | Record<string, string | string[] | undefined>
    | null
    | undefined,
): AuditQuery {
  const get = (key: string): string | null => {
    if (!params) return null;
    if (params instanceof URLSearchParams) return params.get(key);
    const v = params[key];
    if (Array.isArray(v)) return v[0] ?? null;
    return v ?? null;
  };

  const actor = (get("actor") ?? "").trim() || null;
  const action = (get("action") ?? "").trim() || null;
  const target = (get("target") ?? "").trim() || null;
  const from = parseDate(get("from"));
  const to = parseDate(get("to"));
  const cursor = decodeCursor(get("cursor"));
  const limit = parseLimit(get("limit"));

  return { actor, action, target, from, to, cursor, limit };
}

/**
 * Build the Prisma `where` clause for an `AuditQuery`. Exported for tests
 * — the route and the page both go through `runAuditQuery` below in
 * production, but the where-builder is the load-bearing piece worth
 * verifying directly.
 */
export function buildAuditWhere(
  q: AuditQuery,
): Prisma.ControllerAuditLogWhereInput {
  const where: Prisma.ControllerAuditLogWhereInput = {};
  const and: Prisma.ControllerAuditLogWhereInput[] = [];

  if (q.actor) {
    // Operator pasted either a userId (exact) or an email (substring on
    // actorEmail — convenient during incident sweeps where you only have
    // a person, not an id).
    and.push({
      OR: [
        { actorUserId: q.actor },
        { actorEmail: { contains: q.actor, mode: "insensitive" } },
      ],
    });
  }
  if (q.action) {
    and.push({ action: { contains: q.action, mode: "insensitive" } });
  }
  if (q.target) {
    // Target can be a practice id (organizationId) or a user/subject id.
    // We don't ask the operator to disambiguate.
    and.push({
      OR: [{ organizationId: q.target }, { subjectId: q.target }],
    });
  }
  if (q.from || q.to) {
    const at: Prisma.DateTimeFilter = {};
    if (q.from) at.gte = q.from;
    if (q.to) at.lt = q.to; // half-open — see module header
    and.push({ at });
  }
  if (q.cursor) {
    // Cursor is the last row of the previous page. Page-2 starts at
    // (at < cursor.at) OR (at = cursor.at AND id < cursor.id). The
    // tie-break on `id` is required because audit ingest can land
    // multiple rows in the same millisecond.
    const at = new Date(q.cursor.at);
    and.push({
      OR: [
        { at: { lt: at } },
        { AND: [{ at }, { id: { lt: q.cursor.id } }] },
      ],
    });
  }
  if (and.length) where.AND = and;
  return where;
}

/** Standard Prisma `orderBy` for v1 — `at` desc, with `id` as tie-break. */
export const AUDIT_ORDER_BY: Prisma.ControllerAuditLogOrderByWithRelationInput[] = [
  { at: "desc" },
  { id: "desc" },
];

/**
 * Run a paginated query. Returns the rows for the page plus the cursor
 * for the next page (or `null` when fewer than `limit` rows remain).
 */
export async function runAuditQuery(
  prisma: AuditPrisma,
  q: AuditQuery,
): Promise<{ rows: AuditRow[]; nextCursor: string | null }> {
  const rows = await prisma.controllerAuditLog.findMany({
    where: buildAuditWhere(q),
    orderBy: AUDIT_ORDER_BY,
    take: q.limit + 1, // peek one extra to detect "has more"
  });

  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const last = page[page.length - 1];

  const mapped: AuditRow[] = page.map((r) => ({
    id: r.id,
    at: r.at.toISOString(),
    actorUserId: r.actorUserId,
    actorEmail: r.actorEmail,
    actorRoles: r.actorRoles as string[],
    organizationId: r.organizationId,
    action: r.action,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    before: r.before,
    after: r.after,
    reason: r.reason,
  }));

  return {
    rows: mapped,
    nextCursor:
      hasMore && last ? encodeCursor({ at: last.at.toISOString(), id: last.id }) : null,
  };
}

/**
 * Async generator that walks every row matching the query, page by page.
 * Used by the CSV export route so the entire result set can stream out
 * without materialising in memory.
 */
export async function* iterateAuditRows(
  prisma: AuditPrisma,
  q: AuditQuery,
): AsyncGenerator<AuditRow, void, unknown> {
  // Page size for the export walk. Larger than the UI page because we're
  // doing serial fetches and want to amortise the round-trip — but small
  // enough that a single page never costs us more than ~1MB of JSON.
  const PAGE = 500;
  let cursor: AuditCursor | null = q.cursor;
  while (true) {
    const page = await runAuditQuery(prisma, { ...q, cursor, limit: PAGE });
    for (const row of page.rows) yield row;
    if (!page.nextCursor) return;
    const next = decodeCursor(page.nextCursor);
    if (!next) return;
    cursor = next;
  }
}

/**
 * Mask anything that *looks* like PHI (email or phone-shaped) in a free-
 * form string. Used for the one-line metadata preview in the table.
 * ControllerAuditLog rows shouldn't carry PHI by design, but the audit
 * surface is the last line of defence — preview-masking is cheap insurance.
 *
 * Full JSON-on-expand is rendered verbatim: the surface is super-admin
 * only and the full payload is sometimes load-bearing during incident
 * triage. The mask is for the at-a-glance row.
 */
export function maskMetadataPreview(input: string): string {
  return input
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, (m) => {
      const at = m.indexOf("@");
      const local = m.slice(0, at);
      return `${local.slice(0, 1)}***@***`;
    })
    .replace(/(?<!\d)(\+?\d[\d\s().-]{7,}\d)(?!\d)/g, "***-***-****");
}

/** Compact, single-line JSON preview with a hard char cap. */
export function metadataPreview(value: unknown, max = 140): string {
  if (value == null) return "";
  let s: string;
  try {
    s = JSON.stringify(value);
  } catch {
    s = String(value);
  }
  if (!s) return "";
  const masked = maskMetadataPreview(s);
  if (masked.length <= max) return masked;
  return masked.slice(0, max - 1) + "…";
}
