// Unit tests for the global-search domain module. The Prisma-dependent
// branches are exercised via a hand-rolled fake `GlobalSearchPrisma` so
// the tests stay snappy and don't require a running DB.

import { describe, expect, it, vi } from "vitest";

import {
  GLOBAL_SEARCH_GROUP_PREVIEW,
  GLOBAL_SEARCH_MIN_QUERY,
  type GlobalSearchPrisma,
  highlightSegments,
  parseCategoryFilter,
  parseLimit,
  parseOffset,
  searchAcrossEMR,
  snippetAround,
  totalResults,
} from "./global-search";

describe("parseCategoryFilter", () => {
  it("returns 'all' for null/undefined/'all'", () => {
    expect(parseCategoryFilter(null)).toBe("all");
    expect(parseCategoryFilter(undefined)).toBe("all");
    expect(parseCategoryFilter("all")).toBe("all");
  });

  it("accepts known categories verbatim", () => {
    expect(parseCategoryFilter("patients")).toBe("patients");
    expect(parseCategoryFilter("messages")).toBe("messages");
    expect(parseCategoryFilter("notes")).toBe("notes");
    expect(parseCategoryFilter("audit")).toBe("audit");
  });

  it("falls back to 'all' on bogus input", () => {
    expect(parseCategoryFilter("orders")).toBe("all");
    expect(parseCategoryFilter("")).toBe("all");
  });
});

describe("parseOffset / parseLimit", () => {
  it("clamps offset to zero on bad input", () => {
    expect(parseOffset(null)).toBe(0);
    expect(parseOffset("-5")).toBe(0);
    expect(parseOffset("abc")).toBe(0);
    expect(parseOffset("7")).toBe(7);
  });

  it("returns fallback when limit is missing", () => {
    expect(parseLimit(undefined, 25)).toBe(25);
    expect(parseLimit("0", 25)).toBe(25);
  });

  it("caps limit at the hard maximum", () => {
    expect(parseLimit("99999", 25)).toBe(100);
  });
});

describe("highlightSegments", () => {
  it("returns a single non-match segment when term is empty", () => {
    expect(highlightSegments("hello", "")).toEqual([
      { text: "hello", match: false },
    ]);
  });

  it("wraps every case-insensitive occurrence", () => {
    const segs = highlightSegments("Maya MAYA maya", "may");
    expect(segs).toEqual([
      { text: "May", match: true },
      { text: "a ", match: false },
      { text: "MAY", match: true },
      { text: "A ", match: false },
      { text: "may", match: true },
      { text: "a", match: false },
    ]);
  });

  it("preserves original casing in matched segments", () => {
    const segs = highlightSegments("Foo BAR baz", "bar");
    expect(segs.find((s) => s.match)?.text).toBe("BAR");
  });
});

describe("snippetAround", () => {
  it("returns the body when no term", () => {
    expect(snippetAround("short body", "")).toBe("short body");
  });

  it("centers the window on the first match", () => {
    const body = "a".repeat(200) + "TARGET" + "b".repeat(200);
    const snip = snippetAround(body, "TARGET", 20);
    expect(snip.startsWith("…")).toBe(true);
    expect(snip.endsWith("…")).toBe(true);
    expect(snip).toContain("TARGET");
  });

  it("does not prefix ellipsis when match is near the start", () => {
    const snip = snippetAround("hello world", "hello", 20);
    expect(snip.startsWith("…")).toBe(false);
  });
});

describe("searchAcrossEMR", () => {
  function buildPrisma(): GlobalSearchPrisma {
    return {
      patient: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "p1",
            firstName: "Maya",
            lastName: "Reyes",
            email: "maya@example.com",
            phone: "415-555-0188",
          },
        ]),
        count: vi.fn().mockResolvedValue(7),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "m1",
            threadId: "t1",
            body: "Hello Maya, here is the lab result you asked about.",
            createdAt: new Date("2026-05-01T10:00:00Z"),
          },
        ]),
        count: vi.fn().mockResolvedValue(2),
      },
      note: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "n1",
            encounterId: "e1",
            status: "finalized",
            narrative: "Patient Maya presented with chronic pain.",
            finalizedAt: new Date("2026-04-29T00:00:00Z"),
            createdAt: new Date("2026-04-29T00:00:00Z"),
          },
        ]),
        count: vi.fn().mockResolvedValue(3),
      },
      auditLog: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "a1",
            action: "note.finalized",
            actorUserId: "u1",
            actorAgent: null,
            subjectType: "Note",
            subjectId: "n1",
            createdAt: new Date("2026-04-29T01:00:00Z"),
          },
        ]),
        count: vi.fn().mockResolvedValue(11),
      },
    };
  }

  it("short-circuits below MIN_QUERY", async () => {
    const db = buildPrisma();
    const res = await searchAcrossEMR(db, "a", "org-1");
    expect(res.patients.total).toBe(0);
    expect(db.patient.findMany).not.toHaveBeenCalled();
    expect(totalResults(res)).toBe(0);
  });

  it("fans out to all four categories when category='all'", async () => {
    const db = buildPrisma();
    const res = await searchAcrossEMR(db, "Maya", "org-1");
    expect(db.patient.findMany).toHaveBeenCalled();
    expect(db.message.findMany).toHaveBeenCalled();
    expect(db.note.findMany).toHaveBeenCalled();
    expect(db.auditLog.findMany).toHaveBeenCalled();
    expect(res.patients.items[0].title).toBe("Maya Reyes");
    expect(res.patients.items[0].href).toBe("/clinic/patients/p1");
    expect(res.messages.items[0].kind).toBe("message");
    expect(res.notes.items[0].kind).toBe("note");
    expect(res.audit.items[0].title).toBe("note.finalized");
    expect(totalResults(res)).toBe(7 + 2 + 3 + 11);
  });

  it("skips other categories when a category is selected", async () => {
    const db = buildPrisma();
    await searchAcrossEMR(db, "Maya", "org-1", { category: "patients" });
    expect(db.patient.findMany).toHaveBeenCalled();
    expect(db.message.findMany).not.toHaveBeenCalled();
    expect(db.note.findMany).not.toHaveBeenCalled();
    expect(db.auditLog.findMany).not.toHaveBeenCalled();
  });

  it("uses the preview limit by default in 'all' mode", async () => {
    const db = buildPrisma();
    await searchAcrossEMR(db, "Maya", "org-1");
    const firstPatientCall = (db.patient.findMany as ReturnType<typeof vi.fn>)
      .mock.calls[0]?.[0];
    expect(firstPatientCall?.take).toBe(GLOBAL_SEARCH_GROUP_PREVIEW);
    expect(firstPatientCall?.skip).toBe(0);
  });

  it("respects the requested offset for a single category", async () => {
    const db = buildPrisma();
    await searchAcrossEMR(db, "Maya", "org-1", {
      category: "messages",
      offset: 25,
      limit: 10,
    });
    const call = (db.message.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(call?.skip).toBe(25);
    expect(call?.take).toBe(10);
  });

  it("constant MIN_QUERY is reasonable", () => {
    // Sanity check — protects against an accidental 0 / 1 default.
    expect(GLOBAL_SEARCH_MIN_QUERY).toBeGreaterThanOrEqual(2);
  });
});
