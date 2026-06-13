import { describe, expect, it } from "vitest";
import {
  parseSectionQuery,
  applySectionQuery,
  type SectionQuery,
} from "./section-query";

// Fixed reference point for deterministic relative-date parsing.
// 2026-06-12 is a Friday.
const NOW = new Date(2026, 5, 12, 14, 30, 0);

// Format using LOCAL components — the parser builds local-midnight dates, so
// toISOString() (UTC) would roll end-of-day across the date line on machines
// behind UTC.
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d?: Date) =>
  d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : undefined;

describe("parseSectionQuery — amounts", () => {
  it("parses comparators with optional $ and commas", () => {
    expect(parseSectionQuery("> 1000").amount).toEqual({ op: ">", value: 1000 });
    expect(parseSectionQuery("<= $1,250.50").amount).toEqual({ op: "<=", value: 1250.5 });
    expect(parseSectionQuery("= 0").amount).toEqual({ op: "=", value: 0 });
  });

  it("leaves remaining words as terms", () => {
    const q = parseSectionQuery("denied > 1000");
    expect(q.amount).toEqual({ op: ">", value: 1000 });
    expect(q.terms).toEqual(["denied"]);
  });
});

describe("parseSectionQuery — relative dates", () => {
  it("'last 30 days' spans 30 days back through end of today", () => {
    const q = parseSectionQuery("last 30 days", NOW);
    expect(q.dateRange?.label).toBe("last 30 days");
    expect(iso(q.dateRange?.from)).toBe("2026-05-13");
    expect(q.dateRange?.to?.getDate()).toBe(12);
  });

  it("'today' and 'yesterday' resolve to single days", () => {
    expect(iso(parseSectionQuery("today", NOW).dateRange?.from)).toBe("2026-06-12");
    expect(iso(parseSectionQuery("yesterday", NOW).dateRange?.from)).toBe("2026-06-11");
    expect(iso(parseSectionQuery("yesterday", NOW).dateRange?.to)).toBe("2026-06-11");
  });

  it("'this month' / 'this year' / 'ytd' start at the period boundary", () => {
    expect(iso(parseSectionQuery("this month", NOW).dateRange?.from)).toBe("2026-06-01");
    expect(iso(parseSectionQuery("this year", NOW).dateRange?.from)).toBe("2026-01-01");
    expect(parseSectionQuery("ytd", NOW).dateRange?.label).toBe("year to date");
    expect(iso(parseSectionQuery("ytd", NOW).dateRange?.from)).toBe("2026-01-01");
  });

  it("'this quarter' starts at the quarter boundary (Q2 for June)", () => {
    expect(iso(parseSectionQuery("this quarter", NOW).dateRange?.from)).toBe("2026-04-01");
  });

  it("shorthand 'last month' = 30-day window", () => {
    expect(iso(parseSectionQuery("last month", NOW).dateRange?.from)).toBe("2026-05-13");
  });
});

describe("parseSectionQuery — explicit dates", () => {
  it("after / since / before set open-ended bounds", () => {
    const after = parseSectionQuery("since 2026-03-01", NOW);
    expect(iso(after.dateRange?.from)).toBe("2026-03-01");
    expect(after.dateRange?.to).toBeUndefined();

    const before = parseSectionQuery("before 2026-03-01", NOW);
    expect(before.dateRange?.to && iso(before.dateRange.to)).toBe("2026-03-01");
    expect(before.dateRange?.from).toBeUndefined();
  });

  it("an explicit range binds both ends", () => {
    const q = parseSectionQuery("2026-01-01 to 2026-02-15", NOW);
    expect(iso(q.dateRange?.from)).toBe("2026-01-01");
    expect(iso(q.dateRange?.to)).toBe("2026-02-15");
  });

  it("a bare ISO date filters that single day", () => {
    const q = parseSectionQuery("2026-04-09", NOW);
    expect(iso(q.dateRange?.from)).toBe("2026-04-09");
    expect(iso(q.dateRange?.to)).toBe("2026-04-09");
  });
});

describe("parseSectionQuery — composition & empties", () => {
  it("combines date + amount + terms", () => {
    const q = parseSectionQuery("aetna denied last 7 days > 500", NOW);
    expect(q.amount).toEqual({ op: ">", value: 500 });
    expect(q.dateRange?.label).toBe("last 7 days");
    expect(q.terms.sort()).toEqual(["aetna", "denied"]);
    expect(q.isEmpty).toBe(false);
  });

  it("flags an empty query", () => {
    expect(parseSectionQuery("   ", NOW).isEmpty).toBe(true);
    expect(parseSectionQuery("", NOW).terms).toEqual([]);
  });
});

interface Row {
  payer: string;
  date: string;
  amount: number;
}
const rows: Row[] = [
  { payer: "Aetna", date: "2026-06-10", amount: 1200 },
  { payer: "Cigna", date: "2026-05-01", amount: 300 },
  { payer: "Aetna", date: "2026-01-15", amount: 50 },
];
const accessors = {
  getDate: (r: Row) => r.date,
  getAmount: (r: Row) => r.amount,
  getText: (r: Row) => r.payer,
};

describe("applySectionQuery", () => {
  const run = (raw: string): Row[] =>
    applySectionQuery(rows, parseSectionQuery(raw, NOW), accessors);

  it("returns all rows for an empty query", () => {
    expect(run("")).toHaveLength(3);
  });

  it("filters by term", () => {
    expect(run("aetna").map((r) => r.amount).sort((a, b) => a - b)).toEqual([50, 1200]);
  });

  it("filters by amount comparator", () => {
    expect(run("> 500")).toEqual([rows[0]]);
  });

  it("filters by date range (last 60 days excludes the January row)", () => {
    const out = run("last 60 days");
    expect(out.map((r) => r.date)).toEqual(["2026-06-10", "2026-05-01"]);
  });

  it("ANDs all facets together", () => {
    expect(run("aetna last 60 days > 500")).toEqual([rows[0]]);
  });

  it("excludes rows missing the facet data", () => {
    const q: SectionQuery = parseSectionQuery("> 100", NOW);
    const out = applySectionQuery(rows, q, { getAmount: () => null });
    expect(out).toHaveLength(0);
  });
});
