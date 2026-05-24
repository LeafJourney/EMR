// Global search core — Stripe/Linear-style "/search" results page (UX run).
//
// Pure(ish) async function over a prisma-shaped client. Returns grouped,
// per-category results so the `/search` server component can render them
// without any second-pass shaping. Highlighting (the `<mark>` wrapper) is
// a UI concern and lives in the React tree — this module only emits
// plain strings and the raw `matchedTerm` so the renderer can do its own
// substring annotation deterministically.
//
// v1 categories: patients, messages, notes, audit. All four scoped to the
// caller's organization. Soft-deleted patients are excluded. Provider
// messages (the doc-to-doc channel) are intentionally out of scope here
// because their bodies are ciphertext envelopes — see EMR-033.
//
// Why a domain module rather than just running the queries in the page?
//   1. Keeps the server component a thin shell, easier to test the page.
//   2. Lets a future /api/search route or the command palette re-use the
//      exact same query shape without duplicating the OR predicates.
//   3. Mirrors the pattern already established by
//      `src/lib/admin/cross-tenant-search.ts` (super-admin search) — same
//      file shape, same function-over-fake-prisma test ergonomics.

import "server-only";

import type { Prisma } from "@prisma/client";

export const GLOBAL_SEARCH_CATEGORIES = [
  "patients",
  "messages",
  "notes",
  "audit",
] as const;

export type GlobalSearchCategory = (typeof GLOBAL_SEARCH_CATEGORIES)[number];

export type GlobalSearchCategoryFilter = GlobalSearchCategory | "all";

/**
 * UI-facing minimum query length. Below this we just render the empty
 * "type to search" state — running OR-of-contains across four tables
 * for a 1-char query is wasteful and produces useless noise.
 */
export const GLOBAL_SEARCH_MIN_QUERY = 2;

/**
 * Default "show top N per group" when the user hasn't picked a category.
 * Linear/Stripe-style "See all 47 →" affordance handles the rest.
 */
export const GLOBAL_SEARCH_GROUP_PREVIEW = 3;

/**
 * Per-category page size when a category IS selected. Larger than the
 * preview to make the dedicated view feel substantive without paging.
 */
export const GLOBAL_SEARCH_PAGE_SIZE = 25;

export const GLOBAL_SEARCH_MAX_LIMIT = 100;

export function parseCategoryFilter(
  raw: string | null | undefined,
): GlobalSearchCategoryFilter {
  if (!raw || raw === "all") return "all";
  if ((GLOBAL_SEARCH_CATEGORIES as readonly string[]).includes(raw)) {
    return raw as GlobalSearchCategory;
  }
  return "all";
}

export function parseOffset(raw: string | null | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export function parseLimit(
  raw: string | null | undefined,
  fallback = GLOBAL_SEARCH_PAGE_SIZE,
): number {
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, GLOBAL_SEARCH_MAX_LIMIT);
}

// ── Result shapes ─────────────────────────────────────────────

export interface PatientHit {
  kind: "patient";
  id: string;
  title: string; // "Maya Reyes"
  snippet: string; // "maya.reyes@example.com · (415) 555-0188"
  href: string;
}

export interface MessageHit {
  kind: "message";
  id: string;
  threadId: string;
  title: string; // first line of body, trimmed
  snippet: string; // body excerpt around match
  createdAt: Date;
  href: string;
}

export interface NoteHit {
  kind: "note";
  id: string;
  encounterId: string;
  title: string; // status + finalised date
  snippet: string; // narrative excerpt around match
  createdAt: Date;
  href: string;
}

export interface AuditHit {
  kind: "audit";
  id: string;
  title: string; // action label
  snippet: string; // "actor → subjectType subjectId"
  createdAt: Date;
  href: string;
}

export type GlobalSearchHit = PatientHit | MessageHit | NoteHit | AuditHit;

export interface GlobalSearchGroup<T extends GlobalSearchHit> {
  /** Total matching rows for this category (used for "See all N →"). */
  total: number;
  /** Rows for the current offset window. */
  items: T[];
}

export interface GlobalSearchResults {
  query: string;
  organizationId: string;
  patients: GlobalSearchGroup<PatientHit>;
  messages: GlobalSearchGroup<MessageHit>;
  notes: GlobalSearchGroup<NoteHit>;
  audit: GlobalSearchGroup<AuditHit>;
}

// ── Prisma surface we depend on ───────────────────────────────
//
// Typed narrowly so unit tests can supply a fake without booting Next.

export interface GlobalSearchPrisma {
  patient: {
    findMany: (args: Prisma.PatientFindManyArgs) => Promise<
      Array<{
        id: string;
        firstName: string;
        lastName: string;
        email: string | null;
        phone: string | null;
      }>
    >;
    count: (args: Prisma.PatientCountArgs) => Promise<number>;
  };
  message: {
    findMany: (args: Prisma.MessageFindManyArgs) => Promise<
      Array<{
        id: string;
        threadId: string;
        body: string;
        createdAt: Date;
      }>
    >;
    count: (args: Prisma.MessageCountArgs) => Promise<number>;
  };
  note: {
    findMany: (args: Prisma.NoteFindManyArgs) => Promise<
      Array<{
        id: string;
        encounterId: string;
        status: string;
        narrative: string | null;
        finalizedAt: Date | null;
        createdAt: Date;
      }>
    >;
    count: (args: Prisma.NoteCountArgs) => Promise<number>;
  };
  auditLog: {
    findMany: (args: Prisma.AuditLogFindManyArgs) => Promise<
      Array<{
        id: string;
        action: string;
        actorUserId: string | null;
        actorAgent: string | null;
        subjectType: string | null;
        subjectId: string | null;
        createdAt: Date;
      }>
    >;
    count: (args: Prisma.AuditLogCountArgs) => Promise<number>;
  };
}

export interface SearchAcrossEMROptions {
  /** Restrict to one category. "all" returns all four. */
  category?: GlobalSearchCategoryFilter;
  /** Per-category page size. Default = GLOBAL_SEARCH_GROUP_PREVIEW for "all",
   *  GLOBAL_SEARCH_PAGE_SIZE for a specific category. */
  limit?: number;
  /** Per-category offset (only meaningful when category != "all"). */
  offset?: number;
}

const EMPTY_GROUP = <T extends GlobalSearchHit>(): GlobalSearchGroup<T> => ({
  total: 0,
  items: [],
});

/**
 * Run the global EMR search. Org-scoped. Always returns the full
 * { patients, messages, notes, audit } envelope — categories not
 * requested come back as empty groups so the renderer can be uniform.
 */
export async function searchAcrossEMR(
  db: GlobalSearchPrisma,
  query: string,
  organizationId: string,
  opts: SearchAcrossEMROptions = {},
): Promise<GlobalSearchResults> {
  const q = query.trim();
  const category = opts.category ?? "all";
  const isAll = category === "all";

  const result: GlobalSearchResults = {
    query: q,
    organizationId,
    patients: EMPTY_GROUP<PatientHit>(),
    messages: EMPTY_GROUP<MessageHit>(),
    notes: EMPTY_GROUP<NoteHit>(),
    audit: EMPTY_GROUP<AuditHit>(),
  };

  if (q.length < GLOBAL_SEARCH_MIN_QUERY) return result;

  const limit =
    opts.limit ?? (isAll ? GLOBAL_SEARCH_GROUP_PREVIEW : GLOBAL_SEARCH_PAGE_SIZE);
  const offset = isAll ? 0 : opts.offset ?? 0;

  const wantPatients = isAll || category === "patients";
  const wantMessages = isAll || category === "messages";
  const wantNotes = isAll || category === "notes";
  const wantAudit = isAll || category === "audit";

  // Fan out concurrently — these are independent queries on independent
  // tables, no need to serialise.
  const [patients, messages, notes, audit] = await Promise.all([
    wantPatients
      ? searchPatientsGroup(db, q, organizationId, limit, offset)
      : EMPTY_GROUP<PatientHit>(),
    wantMessages
      ? searchMessagesGroup(db, q, organizationId, limit, offset)
      : EMPTY_GROUP<MessageHit>(),
    wantNotes
      ? searchNotesGroup(db, q, organizationId, limit, offset)
      : EMPTY_GROUP<NoteHit>(),
    wantAudit
      ? searchAuditGroup(db, q, organizationId, limit, offset)
      : EMPTY_GROUP<AuditHit>(),
  ]);

  result.patients = patients;
  result.messages = messages;
  result.notes = notes;
  result.audit = audit;
  return result;
}

// ── Per-category helpers ──────────────────────────────────────

async function searchPatientsGroup(
  db: GlobalSearchPrisma,
  q: string,
  organizationId: string,
  limit: number,
  offset: number,
): Promise<GlobalSearchGroup<PatientHit>> {
  const where: Prisma.PatientWhereInput = {
    organizationId,
    deletedAt: null,
    OR: [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { email: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
    ],
  };
  const [rows, total] = await Promise.all([
    db.patient.findMany({
      where,
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: limit,
      skip: offset,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
      },
    }),
    db.patient.count({ where }),
  ]);
  return {
    total,
    items: rows.map((p) => ({
      kind: "patient" as const,
      id: p.id,
      title: `${p.firstName} ${p.lastName}`.trim() || "(unnamed patient)",
      snippet: [p.email, p.phone].filter(Boolean).join(" · ") || "—",
      href: `/clinic/patients/${p.id}`,
    })),
  };
}

async function searchMessagesGroup(
  db: GlobalSearchPrisma,
  q: string,
  organizationId: string,
  limit: number,
  offset: number,
): Promise<GlobalSearchGroup<MessageHit>> {
  const where: Prisma.MessageWhereInput = {
    body: { contains: q, mode: "insensitive" },
    // Patient-thread messages are org-scoped via the thread → patient → org join.
    thread: { patient: { organizationId } },
  };
  const [rows, total] = await Promise.all([
    db.message.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        threadId: true,
        body: true,
        createdAt: true,
      },
    }),
    db.message.count({ where }),
  ]);
  return {
    total,
    items: rows.map((m) => ({
      kind: "message" as const,
      id: m.id,
      threadId: m.threadId,
      title: firstLine(m.body) || "(empty message)",
      snippet: snippetAround(m.body, q),
      createdAt: m.createdAt,
      href: `/clinic/messages?thread=${m.threadId}`,
    })),
  };
}

async function searchNotesGroup(
  db: GlobalSearchPrisma,
  q: string,
  organizationId: string,
  limit: number,
  offset: number,
): Promise<GlobalSearchGroup<NoteHit>> {
  // Notes live under encounters, which carry organizationId. We search
  // the free-form narrative column; the structured `blocks` JSON is
  // intentionally out of scope for v1 (would need a custom JSON path
  // expression and tends to over-match agent boilerplate).
  const where: Prisma.NoteWhereInput = {
    narrative: { contains: q, mode: "insensitive" },
    encounter: { organizationId },
  };
  const [rows, total] = await Promise.all([
    db.note.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        encounterId: true,
        status: true,
        narrative: true,
        finalizedAt: true,
        createdAt: true,
      },
    }),
    db.note.count({ where }),
  ]);
  return {
    total,
    items: rows.map((n) => ({
      kind: "note" as const,
      id: n.id,
      encounterId: n.encounterId,
      title: `Note · ${n.status}${
        n.finalizedAt ? ` · ${n.finalizedAt.toISOString().slice(0, 10)}` : ""
      }`,
      snippet: snippetAround(n.narrative ?? "", q),
      createdAt: n.createdAt,
      href: `/clinic/encounters/${n.encounterId}`,
    })),
  };
}

async function searchAuditGroup(
  db: GlobalSearchPrisma,
  q: string,
  organizationId: string,
  limit: number,
  offset: number,
): Promise<GlobalSearchGroup<AuditHit>> {
  const where: Prisma.AuditLogWhereInput = {
    organizationId,
    OR: [
      { action: { contains: q, mode: "insensitive" } },
      { subjectType: { contains: q, mode: "insensitive" } },
      { subjectId: { contains: q, mode: "insensitive" } },
      { actorAgent: { contains: q, mode: "insensitive" } },
      { actorUserId: { contains: q, mode: "insensitive" } },
    ],
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        action: true,
        actorUserId: true,
        actorAgent: true,
        subjectType: true,
        subjectId: true,
        createdAt: true,
      },
    }),
    db.auditLog.count({ where }),
  ]);
  return {
    total,
    items: rows.map((a) => {
      const actor = a.actorAgent ?? a.actorUserId ?? "system";
      const subject = [a.subjectType, a.subjectId].filter(Boolean).join(":");
      return {
        kind: "audit" as const,
        id: a.id,
        title: a.action,
        snippet: subject ? `${actor} → ${subject}` : actor,
        createdAt: a.createdAt,
        href: `/clinic/audit-trail?focus=${a.id}`,
      };
    }),
  };
}

// ── Text helpers ──────────────────────────────────────────────

function firstLine(s: string): string {
  const line = s.split(/\r?\n/, 1)[0] ?? "";
  return line.length > 120 ? `${line.slice(0, 117)}…` : line;
}

/**
 * Returns ~140 chars of `body` centred on the first case-insensitive
 * occurrence of `term`. Falls back to the leading slice if `term` is
 * absent (which shouldn't happen for a row that matched, but we guard
 * against snippet-renderer surprises anyway).
 */
export function snippetAround(body: string, term: string, radius = 70): string {
  if (!body) return "";
  if (!term) return body.length > radius * 2 ? `${body.slice(0, radius * 2)}…` : body;
  const idx = body.toLowerCase().indexOf(term.toLowerCase());
  if (idx === -1) {
    return body.length > radius * 2 ? `${body.slice(0, radius * 2)}…` : body;
  }
  const start = Math.max(0, idx - radius);
  const end = Math.min(body.length, idx + term.length + radius);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < body.length ? "…" : "";
  return `${prefix}${body.slice(start, end)}${suffix}`;
}

/**
 * Split `text` into alternating non-matching / matching segments around
 * every case-insensitive occurrence of `term`. Used by the React tree
 * to wrap matches in `<mark>` without doing any string interpolation
 * (which would lose markup safety). Returns a flat array of
 * `{ text, match }` segments preserving original casing.
 *
 * This is intentionally pure-string so it can be exercised in tests
 * without React.
 */
export function highlightSegments(
  text: string,
  term: string,
): Array<{ text: string; match: boolean }> {
  if (!term) return [{ text, match: false }];
  const t = text;
  const needle = term.toLowerCase();
  const haystack = t.toLowerCase();
  const out: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  while (cursor < t.length) {
    const found = haystack.indexOf(needle, cursor);
    if (found === -1) {
      out.push({ text: t.slice(cursor), match: false });
      break;
    }
    if (found > cursor) {
      out.push({ text: t.slice(cursor, found), match: false });
    }
    out.push({ text: t.slice(found, found + needle.length), match: true });
    cursor = found + needle.length;
  }
  return out;
}

/**
 * Total result count across all four categories. Used by the page
 * header and the empty-state branch.
 */
export function totalResults(r: GlobalSearchResults): number {
  return (
    r.patients.total + r.messages.total + r.notes.total + r.audit.total
  );
}
