import { describe, expect, it } from "vitest";
import {
  type RowHandler,
  makeValidatingHandler,
  parseStagedPayload,
  planResume,
  processBatch,
  terminalStatus,
} from "./runner-core";

describe("parseStagedPayload (EMR-456)", () => {
  it("accepts a well-formed payload and drops non-object rows", () => {
    const p = parseStagedPayload({
      category: "demographics",
      rows: [{ a: 1 }, null, 5, ["x"], { b: 2 }],
    });
    expect(p).toEqual({ category: "demographics", rows: [{ a: 1 }, { b: 2 }] });
  });

  it("rejects malformed payloads", () => {
    expect(parseStagedPayload(null)).toBeNull();
    expect(parseStagedPayload([1, 2])).toBeNull();
    expect(parseStagedPayload({ rows: [] })).toBeNull();
    expect(parseStagedPayload({ category: "x", rows: "nope" })).toBeNull();
  });
});

describe("planResume (EMR-456)", () => {
  it("starts at 0 for a fresh job", () => {
    expect(planResume({ rowsCompleted: 0, rowsFailed: 0 }, 10)).toEqual({
      offset: 0,
      remaining: 10,
      total: 10,
      done: false,
    });
  });

  it("resumes past completed AND failed rows", () => {
    expect(planResume({ rowsCompleted: 6, rowsFailed: 2 }, 10)).toEqual({
      offset: 8,
      remaining: 2,
      total: 10,
      done: false,
    });
  });

  it("is done when everything is accounted for and clamps overruns", () => {
    expect(planResume({ rowsCompleted: 10, rowsFailed: 0 }, 10).done).toBe(true);
    expect(planResume({ rowsCompleted: 99, rowsFailed: 99 }, 10)).toEqual({
      offset: 10,
      remaining: 0,
      total: 10,
      done: true,
    });
  });

  it("treats an empty payload as done", () => {
    expect(planResume({ rowsCompleted: 0, rowsFailed: 0 }, 0).done).toBe(true);
  });
});

describe("processBatch (EMR-456)", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ i }));
  const evenOk: RowHandler = (row) =>
    (row.i as number) % 2 === 0
      ? { ok: true }
      : { ok: false, error: `odd ${row.i}` };

  it("processes a window and tallies completed/failed", () => {
    const r = processBatch(rows, 0, 4, evenOk);
    expect(r.processed).toBe(4);
    expect(r.completed).toBe(2);
    expect(r.failed).toBe(2);
    expect(r.errors).toEqual([
      { index: 1, error: "odd 1" },
      { index: 3, error: "odd 3" },
    ]);
  });

  it("clamps the window to the available rows", () => {
    const r = processBatch(rows, 8, 100, () => ({ ok: true }));
    expect(r.processed).toBe(2);
    expect(r.completed).toBe(2);
  });

  it("counts a throwing handler as a failed row", () => {
    const r = processBatch(rows, 0, 1, () => {
      throw new Error("boom");
    });
    expect(r.failed).toBe(1);
    expect(r.errors[0].error).toBe("boom");
  });

  it("caps retained errors at maxErrors but keeps counting failures", () => {
    const r = processBatch(rows, 0, 10, () => ({ ok: false, error: "x" }), 3);
    expect(r.failed).toBe(10);
    expect(r.errors).toHaveLength(3);
  });
});

describe("terminalStatus (EMR-456)", () => {
  it("completed when nothing failed (or empty)", () => {
    expect(terminalStatus(0, 10)).toBe("completed");
    expect(terminalStatus(0, 0)).toBe("completed");
  });
  it("failed when every row failed", () => {
    expect(terminalStatus(10, 10)).toBe("failed");
  });
  it("completed_with_errors on a partial failure", () => {
    expect(terminalStatus(3, 10)).toBe("completed_with_errors");
  });
});

describe("makeValidatingHandler (EMR-456)", () => {
  it("accepts non-empty objects, rejects empty ones", () => {
    const h = makeValidatingHandler("demographics");
    expect(h({ a: 1 }, 0)).toEqual({ ok: true });
    expect(h({}, 0)).toEqual({ ok: false, error: "empty demographics row" });
  });
});
