import { vi } from "vitest";
vi.mock("server-only", () => ({}));

import { describe, it, expect } from "vitest";
import {
  AUDIT_DEFAULT_LIMIT,
  AUDIT_MAX_LIMIT,
  buildAuditWhere,
  decodeCursor,
  encodeCursor,
  maskMetadataPreview,
  metadataPreview,
  parseAuditQuery,
  parseLimit,
  parseDate,
  runAuditQuery,
} from "./audit-log";

describe("encodeCursor / decodeCursor", () => {
  it("round-trips a cursor through URL-safe base64", () => {
    const c = { at: "2026-05-17T12:34:56.789Z", id: "row_abc123" };
    const round = decodeCursor(encodeCursor(c));
    expect(round).toEqual(c);
  });

  it("returns null for empty input", () => {
    expect(decodeCursor(null)).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
  });

  it("returns null for garbage", () => {
    expect(decodeCursor("not-a-cursor")).toBeNull();
    expect(decodeCursor("Zm9v")).toBeNull(); // valid base64 but not a cursor shape
  });

  it("rejects a cursor with an invalid date", () => {
    const bad = Buffer.from(JSON.stringify({ at: "nope", id: "x" })).toString("base64url");
    expect(decodeCursor(bad)).toBeNull();
  });
});

describe("parseLimit", () => {
  it("returns default for missing", () => {
    expect(parseLimit(null)).toBe(AUDIT_DEFAULT_LIMIT);
    expect(parseLimit("")).toBe(AUDIT_DEFAULT_LIMIT);
  });

  it("clamps to max", () => {
    expect(parseLimit("99999")).toBe(AUDIT_MAX_LIMIT);
  });

  it("rejects non-positive", () => {
    expect(parseLimit("0")).toBe(AUDIT_DEFAULT_LIMIT);
    expect(parseLimit("-5")).toBe(AUDIT_DEFAULT_LIMIT);
  });

  it("passes a sensible value", () => {
    expect(parseLimit("75")).toBe(75);
  });
});

describe("parseDate", () => {
  it("parses ISO", () => {
    const d = parseDate("2026-05-17T00:00:00Z");
    expect(d?.toISOString()).toBe("2026-05-17T00:00:00.000Z");
  });

  it("returns null on garbage", () => {
    expect(parseDate("nope")).toBeNull();
    expect(parseDate(null)).toBeNull();
  });
});

describe("parseAuditQuery — URL round-trip", () => {
  it("parses every filter", () => {
    const params = new URLSearchParams({
      actor: "user_42",
      action: "publish",
      target: "org_99",
      from: "2026-05-01T00:00:00Z",
      to: "2026-05-17T00:00:00Z",
      limit: "10",
    });
    const q = parseAuditQuery(params);
    expect(q.actor).toBe("user_42");
    expect(q.action).toBe("publish");
    expect(q.target).toBe("org_99");
    expect(q.from?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
    expect(q.to?.toISOString()).toBe("2026-05-17T00:00:00.000Z");
    expect(q.limit).toBe(10);
  });

  it("treats empty/whitespace strings as null filters", () => {
    const params = new URLSearchParams({ actor: " ", action: "  " });
    const q = parseAuditQuery(params);
    expect(q.actor).toBeNull();
    expect(q.action).toBeNull();
  });

  it("accepts a plain Record (server-component shape)", () => {
    const q = parseAuditQuery({ action: "grant" });
    expect(q.action).toBe("grant");
  });
});

describe("buildAuditWhere", () => {
  it("returns empty AND when no filters", () => {
    const where = buildAuditWhere({
      actor: null,
      action: null,
      target: null,
      from: null,
      to: null,
      cursor: null,
      limit: 50,
    });
    expect(where).toEqual({});
  });

  it("substring-matches action case-insensitively", () => {
    const where = buildAuditWhere({
      actor: null,
      action: "Publish",
      target: null,
      from: null,
      to: null,
      cursor: null,
      limit: 50,
    });
    expect(where.AND).toContainEqual({
      action: { contains: "Publish", mode: "insensitive" },
    });
  });

  it("matches actor on userId OR email substring", () => {
    const where = buildAuditWhere({
      actor: "alice@example.com",
      action: null,
      target: null,
      from: null,
      to: null,
      cursor: null,
      limit: 50,
    });
    const and = where.AND as Array<Record<string, unknown>>;
    expect(and[0]).toEqual({
      OR: [
        { actorUserId: "alice@example.com" },
        { actorEmail: { contains: "alice@example.com", mode: "insensitive" } },
      ],
    });
  });

  it("matches target on organizationId OR subjectId", () => {
    const where = buildAuditWhere({
      actor: null,
      action: null,
      target: "abc",
      from: null,
      to: null,
      cursor: null,
      limit: 50,
    });
    const and = where.AND as Array<Record<string, unknown>>;
    expect(and[0]).toEqual({
      OR: [{ organizationId: "abc" }, { subjectId: "abc" }],
    });
  });

  it("uses half-open at range (gte from, lt to)", () => {
    const where = buildAuditWhere({
      actor: null,
      action: null,
      target: null,
      from: new Date("2026-05-01Z"),
      to: new Date("2026-05-17Z"),
      cursor: null,
      limit: 50,
    });
    const and = where.AND as Array<{ at?: Record<string, unknown> }>;
    const range = and.find((c) => c.at)?.at;
    expect(range).toEqual({
      gte: new Date("2026-05-01Z"),
      lt: new Date("2026-05-17Z"),
    });
  });

  it("emits a tie-break-on-id cursor predicate", () => {
    const where = buildAuditWhere({
      actor: null,
      action: null,
      target: null,
      from: null,
      to: null,
      cursor: { at: "2026-05-17T00:00:00Z", id: "row_x" },
      limit: 50,
    });
    const and = where.AND as Array<Record<string, unknown>>;
    const cursorPred = and.find((c) => c.OR) as { OR: Array<Record<string, unknown>> };
    expect(cursorPred.OR[0]).toEqual({ at: { lt: new Date("2026-05-17T00:00:00Z") } });
    expect(cursorPred.OR[1]).toMatchObject({
      AND: [{ at: new Date("2026-05-17T00:00:00Z") }, { id: { lt: "row_x" } }],
    });
  });
});

describe("runAuditQuery — pagination peek", () => {
  it("returns nextCursor when there is at least one more row", async () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({
      id: `row_${i}`,
      at: new Date(2026, 4, 17, 12, 0, 0, 5 - i),
      actorUserId: "u",
      actorEmail: null,
      actorRoles: ["super_admin"],
      organizationId: null,
      action: "controller.test",
      subjectType: "Test",
      subjectId: "s",
      before: null,
      after: null,
      reason: null,
    }));
    const fakePrisma = {
      controllerAuditLog: {
        findMany: vi.fn().mockResolvedValue(rows),
      },
    };

    const result = await runAuditQuery(fakePrisma, {
      actor: null,
      action: null,
      target: null,
      from: null,
      to: null,
      cursor: null,
      limit: 5,
    });

    expect(result.rows).toHaveLength(5);
    expect(result.nextCursor).not.toBeNull();
    const decoded = decodeCursor(result.nextCursor);
    expect(decoded?.id).toBe("row_4");
  });

  it("returns null nextCursor when fewer than limit rows remain", async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `row_${i}`,
      at: new Date(2026, 4, 17, 12, 0, 0, 5 - i),
      actorUserId: "u",
      actorEmail: null,
      actorRoles: ["super_admin"],
      organizationId: null,
      action: "controller.test",
      subjectType: "Test",
      subjectId: "s",
      before: null,
      after: null,
      reason: null,
    }));
    const fakePrisma = {
      controllerAuditLog: {
        findMany: vi.fn().mockResolvedValue(rows),
      },
    };

    const result = await runAuditQuery(fakePrisma, {
      actor: null,
      action: null,
      target: null,
      from: null,
      to: null,
      cursor: null,
      limit: 5,
    });

    expect(result.rows).toHaveLength(3);
    expect(result.nextCursor).toBeNull();
  });
});

describe("maskMetadataPreview", () => {
  it("masks emails", () => {
    const masked = maskMetadataPreview('"email":"alice@example.com"');
    expect(masked).toContain("a***@***");
    expect(masked).not.toContain("alice@example.com");
  });

  it("masks phone numbers", () => {
    const masked = maskMetadataPreview('"phone":"+1 555 867 5309"');
    expect(masked).toContain("***-***-****");
    expect(masked).not.toContain("555 867 5309");
  });

  it("leaves non-PHI strings alone", () => {
    expect(maskMetadataPreview('{"action":"publish"}')).toBe('{"action":"publish"}');
  });
});

describe("metadataPreview", () => {
  it("returns empty for null", () => {
    expect(metadataPreview(null)).toBe("");
    expect(metadataPreview(undefined)).toBe("");
  });

  it("compacts JSON", () => {
    expect(metadataPreview({ a: 1 })).toBe('{"a":1}');
  });

  it("masks PHI before clipping", () => {
    const p = metadataPreview({ email: "alice@example.com" });
    expect(p).toContain("a***@***");
  });

  it("clips with an ellipsis when too long", () => {
    const big = metadataPreview({ x: "a".repeat(200) }, 50);
    expect(big.length).toBe(50);
    expect(big.endsWith("…")).toBe(true);
  });
});
