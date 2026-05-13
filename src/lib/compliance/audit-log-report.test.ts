import { describe, expect, it } from "vitest";
import {
  type AuditLogReportRow,
  renderAuditLogReportCsv,
  renderAuditLogReportHtml,
  summarizeAuditRows,
} from "./audit-log-report";

function row(over: Partial<AuditLogReportRow>): AuditLogReportRow {
  return {
    id: "log_" + Math.random().toString(36).slice(2, 8),
    at: new Date("2026-05-01T12:00:00Z"),
    organizationId: "org_1",
    actorUserId: "u1",
    actorEmail: "alice@clinic.test",
    action: "chart.viewed",
    subjectType: "patient",
    subjectId: "p1",
    ...over,
  };
}

describe("summarizeAuditRows", () => {
  it("counts rows, actors, and unique actions", () => {
    const s = summarizeAuditRows([
      row({}),
      row({ actorEmail: "bob@clinic.test", action: "note.finalized" }),
      row({ action: "note.finalized" }),
    ]);
    expect(s.rowCount).toBe(3);
    expect(s.actorCount).toBe(2);
    expect(s.uniqueActions).toBe(2);
  });

  it("ranks top actors by event count", () => {
    const s = summarizeAuditRows([
      row({ actorEmail: "alice@clinic.test" }),
      row({ actorEmail: "alice@clinic.test" }),
      row({ actorEmail: "bob@clinic.test" }),
    ]);
    expect(s.topActors[0]).toEqual({
      actor: "alice@clinic.test",
      count: 2,
    });
    expect(s.topActors[1]).toEqual({
      actor: "bob@clinic.test",
      count: 1,
    });
  });

  it("buckets known sensitive actions into exception counters", () => {
    const s = summarizeAuditRows([
      row({ action: "phi.sensitive.break_glass" }),
      row({ action: "phi.sensitive.viewed" }),
      row({ action: "rx.contraindication.override" }),
      row({ action: "auth.login.failed" }),
      row({ action: "auth.mfa.failed" }),
      row({ action: "document.downloaded" }),
      row({ action: "research.export" }),
    ]);
    expect(s.exceptions).toEqual({
      breakGlass: 1,
      sensitiveAccess: 1,
      contraindicationOverride: 1,
      authFailure: 2,
      bulkExport: 2,
    });
  });

  it("computes earliest/latest span", () => {
    const s = summarizeAuditRows([
      row({ at: new Date("2026-01-01T00:00:00Z") }),
      row({ at: new Date("2026-02-01T00:00:00Z") }),
      row({ at: new Date("2026-03-01T00:00:00Z") }),
    ]);
    expect(s.span).toEqual({
      earliest: "2026-01-01T00:00:00.000Z",
      latest: "2026-03-01T00:00:00.000Z",
    });
  });

  it("returns a null span when there are zero rows", () => {
    expect(summarizeAuditRows([]).span).toBeNull();
  });

  it("falls back to actorUserId / actorAgent when no email is present", () => {
    const s = summarizeAuditRows([
      row({ actorEmail: null, actorUserId: "u1", actorAgent: null }),
      row({ actorEmail: null, actorUserId: null, actorAgent: "agent:scribe@1.0" }),
      row({ actorEmail: null, actorUserId: null, actorAgent: null }),
    ]);
    const labels = s.topActors.map((a) => a.actor).sort();
    expect(labels).toEqual(["agent:scribe@1.0", "u1", "unknown"]);
  });
});

describe("renderAuditLogReportHtml", () => {
  it("includes cover heading, filter values, and detail rows", () => {
    const html = renderAuditLogReportHtml({
      rows: [row({})],
      filters: {
        organizationId: "org_1",
        organizationName: "Greenleaf Clinic",
        patientLabel: "Jane Doe",
        patientId: "p1",
        actorUserId: "alice@clinic.test",
        action: "chart.viewed",
        since: "2026-04-01T00:00:00Z",
        until: "2026-05-01T00:00:00Z",
      },
      generatedAt: new Date("2026-05-12T15:00:00Z"),
      practiceLabel: "Greenleaf Clinic",
    });
    expect(html).toMatch(/Audit Log Report/);
    expect(html).toMatch(/Greenleaf Clinic/);
    expect(html).toMatch(/Jane Doe/);
    expect(html).toMatch(/2026-05-12 15:00:00Z/);
    expect(html).toMatch(/chart\.viewed/);
    expect(html).toMatch(/45 CFR §164\.312\(b\)/);
  });

  it("escapes user-supplied HTML in actor names + actions", () => {
    const html = renderAuditLogReportHtml({
      rows: [
        row({
          actorEmail: '<script>alert("x")</script>',
          action: "<img onerror=1>",
        }),
      ],
      filters: { organizationName: "Org & Co." },
      generatedAt: "2026-05-12T15:00:00Z",
    });
    expect(html).not.toMatch(/<script>alert\("x"\)<\/script>/);
    expect(html).not.toMatch(/<img onerror=1>/);
    expect(html).toMatch(/&lt;script&gt;/);
    expect(html).toMatch(/&lt;img onerror=1&gt;/);
    expect(html).toMatch(/Org &amp; Co\./);
  });

  it("shows the empty-state when there are no rows", () => {
    const html = renderAuditLogReportHtml({
      rows: [],
      filters: {},
      generatedAt: "2026-05-12T15:00:00Z",
    });
    expect(html).toMatch(/No events match the filter/);
    expect(html).toMatch(/No events in window/);
  });

  it("flags exception counts > 0 with the .flag class", () => {
    const html = renderAuditLogReportHtml({
      rows: [row({ action: "phi.sensitive.break_glass" })],
      filters: {},
      generatedAt: "2026-05-12T15:00:00Z",
    });
    expect(html).toMatch(/class="num flag"/);
  });
});

describe("renderAuditLogReportCsv", () => {
  it("produces a header row + one row per event", () => {
    const csv = renderAuditLogReportCsv([
      row({ metadata: { reason: "test" } }),
      row({ actorEmail: "bob@clinic.test", action: "note.finalized" }),
    ]);
    const lines = csv.trim().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^at,organizationId,actorUserId,actorEmail/);
  });

  it("quotes cells that contain commas, quotes, or newlines", () => {
    const csv = renderAuditLogReportCsv([
      row({ reason: 'with, comma and "quote"' }),
    ]);
    expect(csv).toMatch(/"with, comma and ""quote"""/);
  });

  it("serializes metadata as stable JSON (keys sorted)", () => {
    const csv = renderAuditLogReportCsv([
      row({ metadata: { z: 1, a: 2 } }),
    ]);
    // Quoted because it has a comma — but keys must be alphabetical.
    expect(csv).toMatch(/"\{""a"":2,""z"":1\}"/);
  });
});
