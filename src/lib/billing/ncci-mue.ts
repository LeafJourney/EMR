// EMR-222 — NCCI / MUE table loader
// ---------------------------------
// CMS publishes the National Correct Coding Initiative (NCCI) PTP edits and
// the Medically Unlikely Edits (MUE) tables every quarter as public-use
// CSVs. This file owns:
//
//   1. CSV parsing for the CMS-published formats
//   2. Bulk loading into the NcciEdit / MueLimit Prisma tables
//   3. Runtime resolvers used by the scrub engine
//   4. A small in-memory cache so the scrub doesn't re-query for every
//      claim line
//
// The in-code starter sets in scrub.ts remain as a fallback for the
// (rare) case where the DB hasn't been seeded yet — the engine prefers
// DB rows when present.

import type { NcciEdit, MueLimit } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// CSV parser
// ---------------------------------------------------------------------------
// CMS PTP CSV header (column-1 / column-2 / effective / deletion /
// modifier-indicator / rationale). The MUE CSV is shaped (HCPCS / units /
// adjudication / rationale / effective). Both files are quoted-comma with
// a header row and CRLF line endings.

/** Minimal RFC 4180-ish CSV parser. Handles quoted commas and escaped
 *  double-quotes ("") inside quoted fields. Pure — no I/O. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      // Strip trailing \r from the previous cell on CRLF endings.
      if (row.length > 0 && row[row.length - 1].endsWith("\r")) {
        row[row.length - 1] = row[row.length - 1].slice(0, -1);
      }
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Quarter helpers
// ---------------------------------------------------------------------------

/** Format a date as the CMS quarter tag, e.g. "2026Q2". */
export function quarterFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${y}Q${q}`;
}

/** Parse a quarter string into the start date (UTC midnight on Jan/Apr/Jul/Oct 1). */
export function quarterToStartDate(quarter: string): Date {
  const m = /^(\d{4})Q([1-4])$/.exec(quarter);
  if (!m) throw new Error(`Invalid quarter "${quarter}" — expected "YYYYQN"`);
  const year = Number(m[1]);
  const q = Number(m[2]);
  return new Date(Date.UTC(year, (q - 1) * 3, 1));
}

// ---------------------------------------------------------------------------
// CMS row mappers
// ---------------------------------------------------------------------------

export interface ParsedNcciRow {
  column1Code: string;
  column2Code: string;
  effectiveDate: Date;
  deletionDate: Date | null;
  modifierIndicator: number;
  rationale: string | null;
}

export interface ParsedMueRow {
  hcpcsCode: string;
  mueValue: number;
  adjudication: number;
  rationale: string | null;
  effectiveDate: Date;
}

/** Parse a single CMS PTP row. Throws on malformed input so the loader
 *  surfaces bad rows rather than silently dropping them. */
export function parseNcciRow(headers: string[], values: string[]): ParsedNcciRow {
  const get = (name: string) => {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(name));
    return idx >= 0 ? values[idx]?.trim() ?? "" : "";
  };
  const col1 = get("column 1");
  const col2 = get("column 2");
  const eff = get("effective");
  const del = get("deletion");
  const ind = get("modifier");
  if (!col1 || !col2) {
    throw new Error(`NCCI row missing column 1/2 codes: ${values.join(",")}`);
  }
  return {
    column1Code: col1,
    column2Code: col2,
    effectiveDate: parseCmsDate(eff) ?? new Date(),
    deletionDate: parseCmsDate(del),
    modifierIndicator: Number(ind) || 0,
    rationale: get("rationale") || null,
  };
}

export function parseMueRow(headers: string[], values: string[]): ParsedMueRow {
  const get = (name: string) => {
    const idx = headers.findIndex((h) => h.toLowerCase().includes(name));
    return idx >= 0 ? values[idx]?.trim() ?? "" : "";
  };
  const code = get("hcpcs");
  const units = Number(get("units")) || Number(get("mue value")) || 0;
  const adj = Number(get("adjudication")) || 0;
  if (!code || units <= 0) {
    throw new Error(`MUE row missing HCPCS or units: ${values.join(",")}`);
  }
  return {
    hcpcsCode: code,
    mueValue: units,
    adjudication: adj,
    rationale: get("rationale") || null,
    effectiveDate: parseCmsDate(get("effective")) ?? new Date(),
  };
}

/** CMS uses "MM/DD/YYYY" in their public CSVs. "*" / blank → null. */
export function parseCmsDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "*") return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (!m) {
    const isoFallback = new Date(trimmed);
    return isNaN(isoFallback.getTime()) ? null : isoFallback;
  }
  const [, mm, dd, yyyy] = m;
  return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
}

// ---------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------

export interface LoadResult {
  table: "ncci" | "mue";
  quarter: string;
  rowCount: number;
}

/** Load a CMS PTP CSV into the NcciEdit table. Idempotent on (col1, col2,
 *  quarter) thanks to the unique index. */
export async function loadNcciCsv(args: {
  csv: string;
  quarter: string;
  source?: string;
  loadedById?: string | null;
}): Promise<LoadResult> {
  const rows = parseCsv(args.csv);
  if (rows.length < 2) return { table: "ncci", quarter: args.quarter, rowCount: 0 };
  const [headers, ...data] = rows;

  const parsed = data
    .filter((r) => r.some((cell) => cell.trim().length > 0))
    .map((r) => parseNcciRow(headers, r));

  // Wipe-and-replace this quarter's rows so re-loading produces the same
  // state as a fresh load.
  await prisma.ncciEdit.deleteMany({ where: { quarter: args.quarter } });
  if (parsed.length > 0) {
    await prisma.ncciEdit.createMany({
      data: parsed.map((p) => ({
        column1Code: p.column1Code,
        column2Code: p.column2Code,
        effectiveDate: p.effectiveDate,
        deletionDate: p.deletionDate,
        modifierIndicator: p.modifierIndicator,
        rationale: p.rationale,
        quarter: args.quarter,
      })),
    });
  }

  await prisma.ncciMueLoadStatus.upsert({
    where: { table: "ncci" },
    create: {
      table: "ncci",
      quarter: args.quarter,
      rowCount: parsed.length,
      source: args.source ?? null,
      loadedById: args.loadedById ?? null,
    },
    update: {
      quarter: args.quarter,
      rowCount: parsed.length,
      source: args.source ?? null,
      loadedById: args.loadedById ?? null,
      loadedAt: new Date(),
    },
  });

  invalidateNcciCache();
  return { table: "ncci", quarter: args.quarter, rowCount: parsed.length };
}

export async function loadMueCsv(args: {
  csv: string;
  quarter: string;
  source?: string;
  loadedById?: string | null;
}): Promise<LoadResult> {
  const rows = parseCsv(args.csv);
  if (rows.length < 2) return { table: "mue", quarter: args.quarter, rowCount: 0 };
  const [headers, ...data] = rows;

  const parsed = data
    .filter((r) => r.some((cell) => cell.trim().length > 0))
    .map((r) => parseMueRow(headers, r));

  await prisma.mueLimit.deleteMany({ where: { quarter: args.quarter } });
  if (parsed.length > 0) {
    await prisma.mueLimit.createMany({
      data: parsed.map((p) => ({
        hcpcsCode: p.hcpcsCode,
        mueValue: p.mueValue,
        adjudication: p.adjudication,
        rationale: p.rationale,
        effectiveDate: p.effectiveDate,
        quarter: args.quarter,
      })),
    });
  }

  await prisma.ncciMueLoadStatus.upsert({
    where: { table: "mue" },
    create: {
      table: "mue",
      quarter: args.quarter,
      rowCount: parsed.length,
      source: args.source ?? null,
      loadedById: args.loadedById ?? null,
    },
    update: {
      quarter: args.quarter,
      rowCount: parsed.length,
      source: args.source ?? null,
      loadedById: args.loadedById ?? null,
      loadedAt: new Date(),
    },
  });

  invalidateNcciCache();
  return { table: "mue", quarter: args.quarter, rowCount: parsed.length };
}

// ---------------------------------------------------------------------------
// Runtime cache + resolvers
// ---------------------------------------------------------------------------
// Scrub runs on every claim — we cache the most-recent quarter in-process
// and refresh hourly. For tests, invalidate via `invalidateNcciCache()`.

interface NcciCache {
  byColumn1: Map<string, NcciEdit[]>;
  mueByCode: Map<string, MueLimit>;
  loadedAt: number;
  quarter: string | null;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
let cache: NcciCache | null = null;

export function invalidateNcciCache(): void {
  cache = null;
}

async function ensureCache(): Promise<NcciCache> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache;

  const [ncciStatus] = await Promise.all([
    prisma.ncciMueLoadStatus.findUnique({ where: { table: "ncci" } }),
  ]);

  const quarter = ncciStatus?.quarter ?? null;

  const [edits, mues] = await Promise.all([
    quarter ? prisma.ncciEdit.findMany({ where: { quarter } }) : Promise.resolve([]),
    quarter ? prisma.mueLimit.findMany({ where: { quarter } }) : Promise.resolve([]),
  ]);

  const byColumn1 = new Map<string, NcciEdit[]>();
  for (const e of edits) {
    const list = byColumn1.get(e.column1Code) ?? [];
    list.push(e);
    byColumn1.set(e.column1Code, list);
  }

  const mueByCode = new Map<string, MueLimit>();
  for (const m of mues) mueByCode.set(m.hcpcsCode, m);

  cache = { byColumn1, mueByCode, loadedAt: Date.now(), quarter };
  return cache;
}

export interface NcciCheckResult {
  /** True when the column-2 code is bundled into the column-1 code. */
  bundled: boolean;
  /** Source row when bundled — null when not bundled or when no DB rows
   *  matched (caller should fall back to the in-code starter set). */
  edit: NcciEdit | null;
  /** Quarter the rule came from, surfaced on scrub messages. */
  quarter: string | null;
}

/** Check a column-1 / column-2 pair against the DB-loaded edits. Returns
 *  bundled=false when no edit row matches; the scrub engine then falls
 *  through to its in-code starter set. */
export async function checkNcciPair(args: {
  column1Code: string;
  column2Code: string;
}): Promise<NcciCheckResult> {
  const c = await ensureCache();
  const candidates = c.byColumn1.get(args.column1Code) ?? [];
  const hit = candidates.find((e) => e.column2Code === args.column2Code);
  return {
    bundled: !!hit,
    edit: hit ?? null,
    quarter: c.quarter,
  };
}

export interface MueCheckResult {
  /** True when units exceed the MUE limit. */
  exceeds: boolean;
  limit: number | null;
  edit: MueLimit | null;
  quarter: string | null;
}

export async function checkMueLimit(args: {
  hcpcsCode: string;
  units: number;
}): Promise<MueCheckResult> {
  const c = await ensureCache();
  const m = c.mueByCode.get(args.hcpcsCode);
  if (!m) return { exceeds: false, limit: null, edit: null, quarter: c.quarter };
  return {
    exceeds: args.units > m.mueValue,
    limit: m.mueValue,
    edit: m,
    quarter: c.quarter,
  };
}

// ---------------------------------------------------------------------------
// Bulk reference snapshot (consumed by the scrub engine — EMR-222)
// ---------------------------------------------------------------------------

export interface NcciMueReferenceData {
  /** Active PTP edits for the loaded quarter (deleted edits filtered out). */
  ncci: Array<{ column1Code: string; column2Code: string; modifierIndicator: number }>;
  /** HCPCS → per-day MUE unit cap for the loaded quarter. */
  mue: Record<string, number>;
  /** Quarter the rows came from, or null when nothing is loaded yet. */
  quarter: string | null;
}

/** Snapshot the whole loaded quarter for the scrub engine. Uses the same
 *  in-process cache as the per-pair resolvers, so the scrub doesn't re-query
 *  the DB for every claim. PTP edits past their deletion date are dropped. */
export async function loadNcciMueReference(): Promise<NcciMueReferenceData> {
  const c = await ensureCache();
  const now = Date.now();
  const ncci: NcciMueReferenceData["ncci"] = [];
  for (const list of c.byColumn1.values()) {
    for (const e of list) {
      if (e.deletionDate && e.deletionDate.getTime() < now) continue;
      ncci.push({
        column1Code: e.column1Code,
        column2Code: e.column2Code,
        modifierIndicator: e.modifierIndicator,
      });
    }
  }
  const mue: Record<string, number> = {};
  for (const [code, m] of c.mueByCode) mue[code] = m.mueValue;
  return { ncci, mue, quarter: c.quarter };
}

/** Convenience for the admin dashboard. */
export async function getLoadStatus(): Promise<{
  ncci: { quarter: string; rowCount: number; loadedAt: Date } | null;
  mue: { quarter: string; rowCount: number; loadedAt: Date } | null;
}> {
  const [ncci, mue] = await Promise.all([
    prisma.ncciMueLoadStatus.findUnique({ where: { table: "ncci" } }),
    prisma.ncciMueLoadStatus.findUnique({ where: { table: "mue" } }),
  ]);
  return {
    ncci: ncci ? { quarter: ncci.quarter, rowCount: ncci.rowCount, loadedAt: ncci.loadedAt } : null,
    mue: mue ? { quarter: mue.quarter, rowCount: mue.rowCount, loadedAt: mue.loadedAt } : null,
  };
}
