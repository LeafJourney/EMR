// EMR-738 — Cross-tenant search core.
//
// Pure functions that take a prisma-shaped client and return a tagged-union
// of search results across patients/orders/claims/encounters, each row
// carrying its owning organization. Exported separately from the API route
// so it can be unit-tested with a fake prisma without booting Next.js.
//
// v1 is intentionally narrow:
//   - Indexed columns only. No full-text, no fuzzy, no LIKE-with-leading-%.
//   - Patient match: firstName/lastName/email/phone prefix (startsWith,
//     case-insensitive) + id exact.
//   - Order match: id exact. (NOTE: spec mentioned `externalRxId` but the
//     current Prisma schema has no such column on Order — match by id only
//     until the column lands. See TODO(EMR-738-external-rx-id) below.)
//   - Claim match: id exact.
//   - Encounter match: id exact.
//
// The redaction step on the audit query (see `redactQuery`) ensures we
// never persist a PII-shaped value in plaintext into ControllerAuditLog —
// emails and phone-shaped strings are truncated to the first 3 chars.

import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

export const SEARCH_ENTITY_KINDS = [
  "patient",
  "order",
  "claim",
  "encounter",
] as const;

export type SearchEntityKind = (typeof SEARCH_ENTITY_KINDS)[number];

export type SearchEntityFilter = SearchEntityKind | "all";

/** Tagged-union result row. Each variant carries denormalised practice info. */
export type SearchResult =
  | {
      kind: "patient";
      id: string;
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      organizationId: string;
      organizationName: string;
    }
  | {
      kind: "order";
      id: string;
      externalRxId: string | null;
      status: string;
      createdAt: Date;
      organizationId: string;
      organizationName: string;
    }
  | {
      kind: "claim";
      id: string;
      billedAmountCents: number;
      status: string;
      serviceDate: Date;
      organizationId: string;
      organizationName: string;
    }
  | {
      kind: "encounter";
      id: string;
      scheduledFor: Date | null;
      status: string;
      organizationId: string;
      organizationName: string;
    };

export interface SearchResponse {
  results: SearchResult[];
  nextCursor: string | null;
  scannedEntities: SearchEntityKind[];
}

/**
 * Cap per spec: never return more than 50 rows in a single page. The
 * default page size is smaller (25) to keep the UI snappy; the cap exists
 * for callers that bump `limit`.
 */
export const SEARCH_MAX_LIMIT = 50;
export const SEARCH_DEFAULT_LIMIT = 25;
export const SEARCH_MIN_QUERY_LENGTH = 2;

/**
 * Redact PII-shaped queries before they hit the audit log.
 *
 *   - If the query contains `@`, treat as email-shaped → keep first 3 chars
 *     of the local part and replace the rest with `***`.
 *   - If the query matches a phone-shaped pattern (7+ digits, optional
 *     punctuation), keep the first 3 digits + `***`.
 *   - Otherwise, store verbatim.
 *
 * Compliance posture: we want to record search queries so we can
 * investigate misuse, but we should never persist a plaintext email or
 * phone number into ControllerAuditLog. Both shapes are first-class PHI
 * under HIPAA's safe-harbor identifier list.
 */
export function redactQuery(q: string): string {
  const trimmed = q.trim();
  if (!trimmed) return trimmed;

  // Email-shaped: contains an `@`. Keep first 3 chars of the input.
  if (trimmed.includes("@")) {
    return `${trimmed.slice(0, 3)}***`;
  }

  // Phone-shaped: 7+ digits, optionally separated by spaces/dashes/dots/parens/+.
  const digitsOnly = trimmed.replace(/[^\d]/g, "");
  if (digitsOnly.length >= 7 && /^[\d\s.()+\-]+$/.test(trimmed)) {
    return `${digitsOnly.slice(0, 3)}***`;
  }

  return trimmed;
}

/**
 * Parse the `entity` query parameter into a normalized filter. Unknown
 * values fall back to `"all"` rather than throwing — the search surface
 * is meant to be permissive in what it accepts.
 */
export function parseEntityFilter(raw: string | null | undefined): SearchEntityFilter {
  if (!raw) return "all";
  if (raw === "all") return "all";
  if ((SEARCH_ENTITY_KINDS as readonly string[]).includes(raw)) {
    return raw as SearchEntityKind;
  }
  return "all";
}

/**
 * Parse and clamp the `limit` query parameter. Returns the default when
 * absent or unparseable. Capped to SEARCH_MAX_LIMIT.
 */
export function parseLimit(raw: string | null | undefined): number {
  if (!raw) return SEARCH_DEFAULT_LIMIT;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return SEARCH_DEFAULT_LIMIT;
  return Math.min(n, SEARCH_MAX_LIMIT);
}

/**
 * Cursor format. Encoded as base64url of `${kind}:${id}`. Opaque to the
 * client — callers should pass back whatever we returned in nextCursor.
 *
 * We keep cursors per-kind because the SQL queries are per-kind: there's
 * no single global ordering across heterogeneous entity types. In
 * practice this means "next page" continues from the same kind that
 * filled the previous page — fine for v1 since results are returned in a
 * stable kind-order (patient → order → claim → encounter).
 */
export interface ParsedCursor {
  kind: SearchEntityKind;
  id: string;
}

export function encodeCursor(c: ParsedCursor): string {
  const raw = `${c.kind}:${c.id}`;
  // Buffer is available in Node + Next server runtimes.
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function decodeCursor(s: string | null | undefined): ParsedCursor | null {
  if (!s) return null;
  try {
    const decoded = Buffer.from(s, "base64url").toString("utf8");
    const [kind, ...rest] = decoded.split(":");
    if (!kind || rest.length === 0) return null;
    if (!(SEARCH_ENTITY_KINDS as readonly string[]).includes(kind)) return null;
    return { kind: kind as SearchEntityKind, id: rest.join(":") };
  } catch {
    return null;
  }
}

// ── Prisma surface we actually depend on ─────────────────────
//
// We type the dependency narrowly so the unit tests can pass a fake.
// This is the minimum set of model.findMany calls the search uses.

export interface SearchPrisma {
  patient: {
    findMany: (args: Prisma.PatientFindManyArgs) => Promise<
      Array<{
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
        organizationId: string;
      }>
    >;
  };
  order: {
    findMany: (args: Prisma.OrderFindManyArgs) => Promise<
      Array<{
        id: string;
        status: string;
        createdAt: Date;
        organizationId: string;
      }>
    >;
  };
  claim: {
    findMany: (args: Prisma.ClaimFindManyArgs) => Promise<
      Array<{
        id: string;
        billedAmountCents: number;
        status: string;
        serviceDate: Date;
        organizationId: string;
      }>
    >;
  };
  encounter: {
    findMany: (args: Prisma.EncounterFindManyArgs) => Promise<
      Array<{
        id: string;
        scheduledFor: Date | null;
        status: string;
        organizationId: string;
      }>
    >;
  };
  organization: {
    findMany: (args: Prisma.OrganizationFindManyArgs) => Promise<
      Array<{ id: string; name: string }>
    >;
  };
}

/**
 * Heuristic: a query that looks like a CUID (~25 alphanumeric chars) is
 * probably an entity id. We still try other matches too, but we always
 * run id-exact checks when the query looks like one — cheap, indexed,
 * and high-signal.
 */
function looksLikeId(q: string): boolean {
  return /^[a-z0-9]{16,40}$/i.test(q);
}

export interface CrossTenantSearchInput {
  q: string;
  entity: SearchEntityFilter;
  limit: number;
  cursor: ParsedCursor | null;
}

/**
 * Run the cross-tenant search. Pure async function over a prisma-shaped
 * client. Returns the tagged-union response shape used by both the API
 * route and the server-component page.
 */
export async function runCrossTenantSearch(
  db: SearchPrisma,
  input: CrossTenantSearchInput,
): Promise<SearchResponse> {
  const q = input.q.trim();
  const kinds: SearchEntityKind[] =
    input.entity === "all"
      ? [...SEARCH_ENTITY_KINDS]
      : [input.entity];

  // When a cursor is present, we resume from that kind onward. The
  // earlier kinds are skipped because we already returned their rows on
  // the previous page.
  const startIdx = input.cursor
    ? kinds.indexOf(input.cursor.kind)
    : 0;
  const effectiveKinds = startIdx >= 0 ? kinds.slice(startIdx) : kinds;

  const results: SearchResult[] = [];
  let nextCursor: string | null = null;
  const scanned: SearchEntityKind[] = [];

  // Per-kind budget. We over-fetch by 1 to detect "more available".
  const budget = input.limit;

  for (const kind of effectiveKinds) {
    if (results.length >= budget) break;
    scanned.push(kind);
    const remaining = budget - results.length;
    const take = remaining + 1;

    // Only honor the cursor on the first kind we visit on this page.
    const cursorForKind =
      input.cursor && kind === input.cursor.kind ? input.cursor : null;

    if (kind === "patient") {
      const rows = await searchPatients(db, q, take, cursorForKind);
      const head = rows.slice(0, remaining);
      pushPatientResults(results, head);
      if (rows.length > remaining) {
        const last = head[head.length - 1];
        if (last) nextCursor = encodeCursor({ kind: "patient", id: last.id });
        break;
      }
    } else if (kind === "order") {
      const rows = await searchOrders(db, q, take, cursorForKind);
      const head = rows.slice(0, remaining);
      pushOrderResults(results, head);
      if (rows.length > remaining) {
        const last = head[head.length - 1];
        if (last) nextCursor = encodeCursor({ kind: "order", id: last.id });
        break;
      }
    } else if (kind === "claim") {
      const rows = await searchClaims(db, q, take, cursorForKind);
      const head = rows.slice(0, remaining);
      pushClaimResults(results, head);
      if (rows.length > remaining) {
        const last = head[head.length - 1];
        if (last) nextCursor = encodeCursor({ kind: "claim", id: last.id });
        break;
      }
    } else if (kind === "encounter") {
      const rows = await searchEncounters(db, q, take, cursorForKind);
      const head = rows.slice(0, remaining);
      pushEncounterResults(results, head);
      if (rows.length > remaining) {
        const last = head[head.length - 1];
        if (last) nextCursor = encodeCursor({ kind: "encounter", id: last.id });
        break;
      }
    }
  }

  // Hydrate organizationName for every result. One findMany per page.
  const orgIds = Array.from(new Set(results.map((r) => r.organizationId)));
  if (orgIds.length > 0) {
    const orgs = await db.organization.findMany({
      where: { id: { in: orgIds } },
      select: { id: true, name: true },
    });
    const nameById = new Map(orgs.map((o) => [o.id, o.name]));
    for (const r of results) {
      // Fall back to a stable placeholder if the org row vanished mid-flight
      // (e.g. cascade delete during a search). Better than silently dropping.
      (r as { organizationName: string }).organizationName =
        nameById.get(r.organizationId) ?? "(unknown practice)";
    }
  }

  return {
    results,
    nextCursor,
    scannedEntities: scanned,
  };
}

// ── Per-kind query helpers ───────────────────────────────────

async function searchPatients(
  db: SearchPrisma,
  q: string,
  take: number,
  cursor: ParsedCursor | null,
): Promise<
  Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    organizationId: string;
  }>
> {
  const idMatch = looksLikeId(q) ? [{ id: q }] : [];
  const where: Prisma.PatientWhereInput = {
    OR: [
      ...idMatch,
      { firstName: { startsWith: q, mode: "insensitive" } },
      { lastName: { startsWith: q, mode: "insensitive" } },
      { email: { startsWith: q, mode: "insensitive" } },
      { phone: { startsWith: q } },
    ],
  };
  return db.patient.findMany({
    where,
    take,
    orderBy: { id: "asc" },
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      organizationId: true,
    },
  });
}

async function searchOrders(
  db: SearchPrisma,
  q: string,
  take: number,
  cursor: ParsedCursor | null,
): Promise<
  Array<{
    id: string;
    status: string;
    createdAt: Date;
    organizationId: string;
  }>
> {
  // Only run a query if the input shape could plausibly match. Order
  // matches are id-exact only (see TODO(EMR-738-external-rx-id) at the
  // top of the file).
  if (!looksLikeId(q)) return [];
  const where: Prisma.OrderWhereInput = { id: q };
  return db.order.findMany({
    where,
    take,
    orderBy: { id: "asc" },
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    select: {
      id: true,
      status: true,
      createdAt: true,
      organizationId: true,
    },
  });
}

async function searchClaims(
  db: SearchPrisma,
  q: string,
  take: number,
  cursor: ParsedCursor | null,
): Promise<
  Array<{
    id: string;
    billedAmountCents: number;
    status: string;
    serviceDate: Date;
    organizationId: string;
  }>
> {
  if (!looksLikeId(q)) return [];
  const where: Prisma.ClaimWhereInput = { id: q };
  return db.claim.findMany({
    where,
    take,
    orderBy: { id: "asc" },
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    select: {
      id: true,
      billedAmountCents: true,
      status: true,
      serviceDate: true,
      organizationId: true,
    },
  });
}

async function searchEncounters(
  db: SearchPrisma,
  q: string,
  take: number,
  cursor: ParsedCursor | null,
): Promise<
  Array<{
    id: string;
    scheduledFor: Date | null;
    status: string;
    organizationId: string;
  }>
> {
  if (!looksLikeId(q)) return [];
  const where: Prisma.EncounterWhereInput = { id: q };
  return db.encounter.findMany({
    where,
    take,
    orderBy: { id: "asc" },
    ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    select: {
      id: true,
      scheduledFor: true,
      status: true,
      organizationId: true,
    },
  });
}

// ── Result-shape helpers ─────────────────────────────────────

function pushPatientResults(
  acc: SearchResult[],
  rows: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    organizationId: string;
  }>,
): void {
  for (const r of rows) {
    acc.push({
      kind: "patient",
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      email: r.email,
      phone: r.phone,
      organizationId: r.organizationId,
      // organizationName hydrated in the caller after the loop.
      organizationName: "",
    });
  }
}

function pushOrderResults(
  acc: SearchResult[],
  rows: Array<{
    id: string;
    status: string;
    createdAt: Date;
    organizationId: string;
  }>,
): void {
  for (const r of rows) {
    acc.push({
      kind: "order",
      id: r.id,
      externalRxId: null,
      status: r.status,
      createdAt: r.createdAt,
      organizationId: r.organizationId,
      organizationName: "",
    });
  }
}

function pushClaimResults(
  acc: SearchResult[],
  rows: Array<{
    id: string;
    billedAmountCents: number;
    status: string;
    serviceDate: Date;
    organizationId: string;
  }>,
): void {
  for (const r of rows) {
    acc.push({
      kind: "claim",
      id: r.id,
      billedAmountCents: r.billedAmountCents,
      status: r.status,
      serviceDate: r.serviceDate,
      organizationId: r.organizationId,
      organizationName: "",
    });
  }
}

function pushEncounterResults(
  acc: SearchResult[],
  rows: Array<{
    id: string;
    scheduledFor: Date | null;
    status: string;
    organizationId: string;
  }>,
): void {
  for (const r of rows) {
    acc.push({
      kind: "encounter",
      id: r.id,
      scheduledFor: r.scheduledFor,
      status: r.status,
      organizationId: r.organizationId,
      organizationName: "",
    });
  }
}

/**
 * Deep-link route for a given result. Used by the UI to send the
 * operator to the per-practice entity page.
 */
export function deepLinkForResult(r: SearchResult): string {
  switch (r.kind) {
    case "patient":
      return `/clinic/patients/${r.id}`;
    case "order":
      return `/clinic/orders/${r.id}`;
    case "claim":
      return `/clinic/billing/claims/${r.id}`;
    case "encounter":
      return `/clinic/encounters/${r.id}`;
  }
}

/**
 * Short, table-friendly label for a result's primary display field.
 */
export function displayNameForResult(r: SearchResult): string {
  switch (r.kind) {
    case "patient":
      return `${r.firstName} ${r.lastName}`.trim() || r.id;
    case "order":
      return r.externalRxId ?? r.id;
    case "claim":
      return `$${(r.billedAmountCents / 100).toFixed(2)} · ${r.status}`;
    case "encounter":
      return r.scheduledFor
        ? r.scheduledFor.toISOString().slice(0, 16).replace("T", " ")
        : r.status;
  }
}

/**
 * Created/reference timestamp for a result, for the Created column.
 */
export function createdAtForResult(r: SearchResult): Date | null {
  switch (r.kind) {
    case "patient":
      return null; // we didn't select createdAt for patient — id is enough
    case "order":
      return r.createdAt;
    case "claim":
      return r.serviceDate;
    case "encounter":
      return r.scheduledFor;
  }
}
