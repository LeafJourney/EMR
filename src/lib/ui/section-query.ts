// MASTER-prompt G8 — the per-section search bar "across from each section
// header" that does chronological / parameter filtering. The directive frames
// it as "AI-driven (Cindy)", but the honest, deterministic core is a small
// natural-language parser: it turns a typed phrase like
//   "last 30 days denied > 1000"
// into a structured { dateRange, amount, terms } filter the section applies to
// its own rows. No LLM call — predictable, testable, and offline. (Kept pure
// and framework-free, like the G3 rankAutocomplete / G6 table-export cores.)

export type AmountOp = ">" | ">=" | "<" | "<=" | "=";

export interface SectionAmountFilter {
  op: AmountOp;
  value: number;
}

export interface SectionDateRange {
  /** Inclusive lower bound (undefined = open). */
  from?: Date;
  /** Inclusive upper bound (undefined = open). */
  to?: Date;
  /** Human-readable chip label, e.g. "last 30 days". */
  label: string;
}

export interface SectionQuery {
  raw: string;
  /** Free-text words left after date/amount phrases are removed. */
  terms: string[];
  dateRange?: SectionDateRange;
  amount?: SectionAmountFilter;
  /** True when nothing meaningful was parsed (no date, amount, or terms). */
  isEmpty: boolean;
}

const DAY_MS = 86_400_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}
function daysBefore(now: Date, n: number): Date {
  return new Date(startOfDay(now).getTime() - n * DAY_MS);
}
function startOfWeek(d: Date): Date {
  // Week starts Monday.
  const x = startOfDay(d);
  const diff = (x.getDay() + 6) % 7;
  return new Date(x.getTime() - diff * DAY_MS);
}
function isoToLocalDate(iso: string): Date {
  // Parse YYYY-MM-DD as a LOCAL date (not UTC) so day boundaries match what
  // the user sees in the section.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// Relative "last/past <N> <unit>" and shorthand windows → day counts.
const NAMED_WINDOW_DAYS: Record<string, number> = {
  week: 7,
  month: 30,
  quarter: 90,
  year: 365,
};

/**
 * Parse a section search phrase into a structured filter. `now` is injected so
 * relative ranges ("last 30 days") are deterministic and testable.
 */
export function parseSectionQuery(raw: string, now: Date = new Date()): SectionQuery {
  let work = ` ${raw.toLowerCase()} `;
  let dateRange: SectionDateRange | undefined;
  let amount: SectionAmountFilter | undefined;

  const consume = (re: RegExp): RegExpMatchArray | null => {
    const m = work.match(re);
    if (m) work = work.replace(m[0], " ");
    return m;
  };

  // --- amount comparator: > 1000, <= $50, = 0 ------------------------------
  const amt = consume(/([<>]=?|=)\s*\$?\s*([\d,]+(?:\.\d+)?)/);
  if (amt) {
    amount = { op: amt[1] as AmountOp, value: Number(amt[2].replace(/,/g, "")) };
  }

  // --- explicit ISO range: 2026-01-01..2026-02-01 / "A to B" ---------------
  let m = consume(/(\d{4}-\d{2}-\d{2})\s*(?:\.\.|to|–|-)\s*(\d{4}-\d{2}-\d{2})/);
  if (m) {
    dateRange = {
      from: startOfDay(isoToLocalDate(m[1])),
      to: endOfDay(isoToLocalDate(m[2])),
      label: `${m[1]} → ${m[2]}`,
    };
  }

  // --- after / since / from DATE ------------------------------------------
  if (!dateRange && (m = consume(/(?:after|since|from)\s+(\d{4}-\d{2}-\d{2})/))) {
    dateRange = { from: startOfDay(isoToLocalDate(m[1])), label: `since ${m[1]}` };
  }
  // --- before / until DATE -------------------------------------------------
  if (!dateRange && (m = consume(/(?:before|until)\s+(\d{4}-\d{2}-\d{2})/))) {
    dateRange = { to: endOfDay(isoToLocalDate(m[1])), label: `before ${m[1]}` };
  }

  // --- relative "last/past N days|weeks|months|years" ----------------------
  if (!dateRange && (m = consume(/(?:last|past)\s+(\d+)\s+(day|week|month|year)s?/))) {
    const n = Number(m[1]);
    const unitDays = m[2] === "day" ? 1 : NAMED_WINDOW_DAYS[m[2]];
    dateRange = {
      from: daysBefore(now, n * unitDays),
      to: endOfDay(now),
      label: `last ${n} ${m[2]}${n === 1 ? "" : "s"}`,
    };
  }

  // --- "today" / "yesterday" ----------------------------------------------
  if (!dateRange && consume(/\byesterday\b/)) {
    const y = daysBefore(now, 1);
    dateRange = { from: y, to: endOfDay(y), label: "yesterday" };
  }
  if (!dateRange && consume(/\btoday\b/)) {
    dateRange = { from: startOfDay(now), to: endOfDay(now), label: "today" };
  }

  // --- "this week|month|quarter|year" / "ytd" ------------------------------
  if (!dateRange && consume(/\bthis\s+week\b/)) {
    dateRange = { from: startOfWeek(now), to: endOfDay(now), label: "this week" };
  }
  if (!dateRange && consume(/\bthis\s+month\b/)) {
    dateRange = {
      from: new Date(now.getFullYear(), now.getMonth(), 1),
      to: endOfDay(now),
      label: "this month",
    };
  }
  if (!dateRange && consume(/\bthis\s+quarter\b/)) {
    const q = Math.floor(now.getMonth() / 3);
    dateRange = {
      from: new Date(now.getFullYear(), q * 3, 1),
      to: endOfDay(now),
      label: "this quarter",
    };
  }
  if (!dateRange && consume(/\b(?:this\s+year|ytd)\b/)) {
    dateRange = {
      from: new Date(now.getFullYear(), 0, 1),
      to: endOfDay(now),
      label: "year to date",
    };
  }

  // --- shorthand "last week|month|quarter|year" ----------------------------
  if (!dateRange && (m = consume(/(?:last|past)\s+(week|month|quarter|year)\b/))) {
    const days = NAMED_WINDOW_DAYS[m[1]];
    dateRange = { from: daysBefore(now, days), to: endOfDay(now), label: `last ${m[1]}` };
  }

  // --- bare ISO date → that single day ------------------------------------
  if (!dateRange && (m = consume(/(\d{4}-\d{2}-\d{2})/))) {
    const d = isoToLocalDate(m[1]);
    dateRange = { from: startOfDay(d), to: endOfDay(d), label: m[1] };
  }

  const terms = work
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  return {
    raw,
    terms,
    dateRange,
    amount,
    isEmpty: !dateRange && !amount && terms.length === 0,
  };
}

export interface SectionQueryAccessors<T> {
  /** Row's date for chronological filtering. Return null to never match a range. */
  getDate?: (row: T) => Date | string | null | undefined;
  /** Row's numeric value for amount comparators. */
  getAmount?: (row: T) => number | null | undefined;
  /** Row's searchable text for the free terms (joined, lower-cased internally). */
  getText?: (row: T) => string;
}

function inRange(date: Date, range: SectionDateRange): boolean {
  if (range.from && date < range.from) return false;
  if (range.to && date > range.to) return false;
  return true;
}

function compareAmount(value: number, f: SectionAmountFilter): boolean {
  switch (f.op) {
    case ">":
      return value > f.value;
    case ">=":
      return value >= f.value;
    case "<":
      return value < f.value;
    case "<=":
      return value <= f.value;
    case "=":
      return value === f.value;
  }
}

/**
 * Apply a parsed SectionQuery to a row list. Each active facet (date, amount,
 * terms) is an AND; terms themselves are an AND across the row's text. Rows
 * missing the data a facet needs are excluded from that facet.
 */
export function applySectionQuery<T>(
  rows: readonly T[],
  query: SectionQuery,
  accessors: SectionQueryAccessors<T>,
): T[] {
  if (query.isEmpty) return [...rows];
  const { getDate, getAmount, getText } = accessors;

  return rows.filter((row) => {
    if (query.dateRange && getDate) {
      const raw = getDate(row);
      if (raw == null) return false;
      const d = raw instanceof Date ? raw : new Date(raw);
      if (Number.isNaN(d.getTime()) || !inRange(d, query.dateRange)) return false;
    }
    if (query.amount && getAmount) {
      const v = getAmount(row);
      if (v == null || !compareAmount(v, query.amount)) return false;
    }
    if (query.terms.length > 0 && getText) {
      const hay = getText(row).toLowerCase();
      if (!query.terms.every((t) => hay.includes(t))) return false;
    }
    return true;
  });
}
