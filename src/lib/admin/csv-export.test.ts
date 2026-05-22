import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  logControllerAction: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/audit-stub", () => ({
  logControllerAction: hoisted.logControllerAction,
}));

import {
  escapeCsvCell,
  practiceIdColumn,
  streamCsvResponse,
  type CsvColumn,
} from "./csv-export";

const ACTOR = {
  id: "user_1",
  email: "admin@leafjourney.com",
  roles: [] as never[],
  organizationId: null,
};

beforeEach(() => {
  hoisted.logControllerAction.mockClear();
});

describe("escapeCsvCell", () => {
  it("returns empty string for null and undefined", () => {
    expect(escapeCsvCell(null)).toBe("");
    expect(escapeCsvCell(undefined)).toBe("");
  });

  it("stringifies numbers without quoting", () => {
    expect(escapeCsvCell(42)).toBe("42");
    expect(escapeCsvCell(0)).toBe("0");
    expect(escapeCsvCell(3.14)).toBe("3.14");
  });

  it("passes plain strings through unquoted", () => {
    expect(escapeCsvCell("hello")).toBe("hello");
    expect(escapeCsvCell("")).toBe("");
  });

  it("quotes strings containing commas", () => {
    expect(escapeCsvCell("a,b")).toBe('"a,b"');
  });

  it("quotes strings containing double quotes and doubles the quote", () => {
    expect(escapeCsvCell('she said "hi"')).toBe('"she said ""hi"""');
  });

  it("preserves embedded newlines inside a quoted cell", () => {
    expect(escapeCsvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(escapeCsvCell("line1\r\nline2")).toBe('"line1\r\nline2"');
  });

  it("handles strings with all the dangerous characters", () => {
    expect(escapeCsvCell('a,b"c\nd')).toBe('"a,b""c\nd"');
  });
});

describe("streamCsvResponse — basic shape", () => {
  it("emits header row + RFC-4180 rows from a sync iterable", async () => {
    const columns: CsvColumn<{ id: string; name: string }>[] = [
      { header: "Practice ID", get: (r) => r.id },
      { header: "Name", get: (r) => r.name },
    ];
    const response = await streamCsvResponse({
      rows: [
        { id: "p1", name: "Acme, Inc." },
        { id: "p2", name: 'Quote "Co"' },
      ],
      columns,
      filename: "practices",
      audit: { entity: "Practice", filters: {}, actor: ACTOR },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/csv; charset=utf-8",
    );
    const disp = response.headers.get("content-disposition");
    expect(disp).toMatch(
      /^attachment; filename="practices-\d{4}-\d{2}-\d{2}\.csv"$/,
    );

    const text = await response.text();
    expect(text).toBe(
      'Practice ID,Name\r\n' +
        'p1,"Acme, Inc."\r\n' +
        'p2,"Quote ""Co"""\r\n',
    );
  });

  it("uses human-readable headers, never accessor names", async () => {
    const response = await streamCsvResponse({
      rows: [{ organizationId: "p1", billedAmountCents: 12345 }],
      columns: [
        { header: "Practice ID", get: (r) => r.organizationId },
        { header: "Billed", get: (r) => (r.billedAmountCents / 100).toFixed(2) },
      ],
      filename: "claims",
      audit: { entity: "Claim", filters: {}, actor: ACTOR },
    });
    const text = await response.text();
    expect(text.split("\r\n")[0]).toBe("Practice ID,Billed");
    expect(text).not.toContain("organizationId");
    expect(text).not.toContain("billedAmountCents");
  });
});

describe("streamCsvResponse — practice_id enforcement", () => {
  it("throws when no practice_id column is present and the requirement is on", async () => {
    await expect(
      streamCsvResponse({
        rows: [{ x: 1 }],
        columns: [{ header: "X", get: (r) => r.x }],
        filename: "x",
        audit: { entity: "X", filters: {}, actor: ACTOR },
      }),
    ).rejects.toThrow(/practice_id column/);
  });

  it("accepts a column whose header normalises to 'practice id'", async () => {
    const cols: CsvColumn<{ id: string }>[] = [
      { header: "PRACTICE_ID", get: (r) => r.id },
    ];
    await expect(
      streamCsvResponse({
        rows: [{ id: "p1" }],
        columns: cols,
        filename: "x",
        audit: { entity: "X", filters: {}, actor: ACTOR },
      }),
    ).resolves.toBeInstanceOf(Response);
  });

  it("accepts a column tagged via practiceIdColumn() even with a different header", async () => {
    type Row = { orgId: string };
    const cols: CsvColumn<Row>[] = [
      practiceIdColumn<Row>("Organization ID", (r) => r.orgId),
    ];
    await expect(
      streamCsvResponse({
        rows: [{ orgId: "p1" }] as Row[],
        columns: cols,
        filename: "x",
        audit: { entity: "X", filters: {}, actor: ACTOR },
      }),
    ).resolves.toBeInstanceOf(Response);
  });

  it("skips the requirement when explicitly opted out", async () => {
    await expect(
      streamCsvResponse({
        rows: [{ x: 1 }],
        columns: [{ header: "X", get: (r) => r.x }],
        filename: "x",
        audit: { entity: "X", filters: {}, actor: ACTOR },
        requirePracticeIdColumn: false,
      }),
    ).resolves.toBeInstanceOf(Response);
  });
});

describe("streamCsvResponse — audit emission", () => {
  it("emits exactly one super_admin.csv_export audit row before the stream starts", async () => {
    const columns: CsvColumn<{ id: string }>[] = [
      { header: "Practice ID", get: (r) => r.id },
    ];
    let yielded = 0;
    async function* source() {
      for (let i = 0; i < 3; i++) {
        yielded++;
        yield { id: `p${i}` };
      }
    }

    // Audit log emission happens inside streamCsvResponse BEFORE the
    // ReadableStream is constructed, so the mock must already be called
    // by the time we get the Response back.
    const response = await streamCsvResponse({
      rows: source(),
      columns,
      filename: "practices",
      audit: {
        entity: "Practice",
        filters: { active: true, since: "2026-01-01" },
        actor: ACTOR,
      },
    });

    expect(hoisted.logControllerAction).toHaveBeenCalledTimes(1);
    expect(yielded).toBe(0);

    const calls = hoisted.logControllerAction.mock.calls as unknown as Array<
      [
        {
          action: string;
          actor: { id: string };
          targetId: string;
          after: Record<string, unknown>;
        },
      ]
    >;
    const call = calls[0][0];
    expect(call.action).toBe("super_admin.csv_export");
    expect(call.actor.id).toBe(ACTOR.id);
    expect(call.targetId).toBe("Practice");
    expect(call.after).toMatchObject({
      entity: "Practice",
      filters: { active: true, since: "2026-01-01" },
      filename: "practices",
      columns: ["Practice ID"],
    });

    await response.text();
    expect(yielded).toBe(3);
  });

  it("refuses to run without an audit payload", async () => {
    await expect(
      streamCsvResponse({
        rows: [],
        columns: [{ header: "Practice ID", get: () => "" }],
        filename: "x",
        // @ts-expect-error — exercising runtime guard.
        audit: undefined,
      }),
    ).rejects.toThrow(/audit/);
  });
});

describe("streamCsvResponse — streaming behaviour", () => {
  it("returns the Response within 200ms even for 50k rows (does not buffer)", async () => {
    const N = 50_000;
    async function* source() {
      for (let i = 0; i < N; i++) {
        yield { id: `p${i}`, name: `Practice ${i}` };
      }
    }

    const t0 = performance.now();
    const response = await streamCsvResponse({
      rows: source(),
      columns: [
        { header: "Practice ID", get: (r) => r.id },
        { header: "Name", get: (r) => r.name },
      ],
      filename: "practices",
      audit: { entity: "Practice", filters: {}, actor: ACTOR },
    });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(200);
    expect(response).toBeInstanceOf(Response);

    // Drain and count bytes — confirms streamed total matches expectation.
    const reader = response.body!.getReader();
    let totalBytes = 0;
    let rowCount = 0;
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";
      rowCount += lines.length;
    }
    buffer += decoder.decode();
    if (buffer.length) rowCount++;

    // 1 header + N data rows, all terminated with CRLF.
    expect(rowCount).toBe(N + 1);

    // Byte total: header "Practice ID,Name\r\n" = 18 bytes.
    // Each row: `p${i},Practice ${i}\r\n` — varying length, so compute.
    let expected = "Practice ID,Name\r\n".length;
    for (let i = 0; i < N; i++) {
      expected += `p${i},Practice ${i}\r\n`.length;
    }
    expect(totalBytes).toBe(expected);
  }, 30_000);
});
