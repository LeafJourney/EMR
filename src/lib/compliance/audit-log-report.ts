/**
 * EMR-064 — Audit Log PDF Export
 *
 * Renders a print-ready HTML report from a filtered set of `AuditLog`
 * rows. Browsers turn this into a PDF via the standard print pipeline
 * (`window.print()` or a server-side Chromium headless renderer), so we
 * don't need a heavy PDF SDK dependency for v1.
 *
 * The renderer is pure: it takes already-fetched rows + filter metadata
 * and returns an HTML string. The route handler (or CLI) handles
 * authorization, pagination, and the actual response/file write.
 *
 * Report sections:
 *   1. Cover — practice name, filter window, generated-at, row count.
 *   2. Filter summary — actor, subject, action, date range, etc.
 *   3. Aggregate roll-up — top actors, top actions, exception counts.
 *   4. Detailed row table — every event with timestamp, actor, action,
 *      subject, IP / agent, metadata flags.
 *   5. Compliance footnote — references the HIPAA controls this
 *      satisfies and the integrity hash chain (when available).
 *
 * HIPAA §164.312(b) requires the ability to record AND examine activity
 * in PHI systems — this is the "examine" surface in a portable form
 * auditors can take with them.
 */

export interface AuditLogReportRow {
  id: string;
  at: Date | string;
  organizationId?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  actorAgent?: string | null;
  actorRoles?: string[] | null;
  action: string;
  subjectType?: string | null;
  subjectId?: string | null;
  metadata?: Record<string, unknown> | null;
  reason?: string | null;
  /** Optional row hash from the tamper-evident chain. */
  rowHash?: string | null;
}

export interface AuditLogReportFilters {
  organizationId?: string | null;
  organizationName?: string | null;
  actorUserId?: string | null;
  subjectType?: string | null;
  subjectId?: string | null;
  patientId?: string | null;
  patientLabel?: string | null;
  action?: string | null;
  since?: Date | string | null;
  until?: Date | string | null;
}

export interface AuditLogReportSummary {
  rowCount: number;
  actorCount: number;
  uniqueActions: number;
  topActors: Array<{ actor: string; count: number }>;
  topActions: Array<{ action: string; count: number }>;
  /** Counts of well-known sensitive-action categories. */
  exceptions: {
    breakGlass: number;
    contraindicationOverride: number;
    bulkExport: number;
    authFailure: number;
    sensitiveAccess: number;
  };
  /** Spans the from/to of the rendered rows; null when no rows. */
  span: { earliest: string; latest: string } | null;
}

const SENSITIVE_ACTIONS = new Set([
  "phi.sensitive.viewed",
  "phi.sensitive.break_glass",
  "rx.contraindication.override",
  "auth.login.failed",
  "auth.mfa.failed",
  "export.generated",
  "document.downloaded",
  "research.export",
]);

function asIso(d: Date | string | null | undefined): string | null {
  if (d == null) return null;
  if (typeof d === "string") return d;
  return d.toISOString();
}

function fmtDateTime(d: Date | string): string {
  const date = typeof d === "string" ? new Date(d) : d;
  // Match the audit-table convention used elsewhere in the EMR: ISO-ish,
  // human-readable, no microseconds. Always UTC so the report doesn't
  // shift when downloaded across time zones.
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getUTCFullYear();
  const mm = pad(date.getUTCMonth() + 1);
  const dd = pad(date.getUTCDate());
  const hh = pad(date.getUTCHours());
  const mi = pad(date.getUTCMinutes());
  const ss = pad(date.getUTCSeconds());
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}Z`;
}

function bucketAction(action: string): keyof AuditLogReportSummary["exceptions"] | null {
  if (action === "phi.sensitive.break_glass") return "breakGlass";
  if (action === "rx.contraindication.override") return "contraindicationOverride";
  if (
    action === "export.generated" ||
    action === "document.downloaded" ||
    action === "research.export"
  ) {
    return "bulkExport";
  }
  if (action === "auth.login.failed" || action === "auth.mfa.failed") {
    return "authFailure";
  }
  if (action === "phi.sensitive.viewed") return "sensitiveAccess";
  return null;
}

export function summarizeAuditRows(
  rows: AuditLogReportRow[],
): AuditLogReportSummary {
  const actorCount = new Map<string, number>();
  const actionCount = new Map<string, number>();
  const exceptions = {
    breakGlass: 0,
    contraindicationOverride: 0,
    bulkExport: 0,
    authFailure: 0,
    sensitiveAccess: 0,
  };
  let earliest: Date | null = null;
  let latest: Date | null = null;

  for (const r of rows) {
    const actor = r.actorEmail ?? r.actorUserId ?? r.actorAgent ?? "unknown";
    actorCount.set(actor, (actorCount.get(actor) ?? 0) + 1);
    actionCount.set(r.action, (actionCount.get(r.action) ?? 0) + 1);

    const bucket = bucketAction(r.action);
    if (bucket) exceptions[bucket] += 1;

    const t = typeof r.at === "string" ? new Date(r.at) : r.at;
    if (!earliest || t < earliest) earliest = t;
    if (!latest || t > latest) latest = t;
  }

  const sortDesc = <T extends { count: number }>(arr: T[]) =>
    [...arr].sort((a, b) => b.count - a.count);
  const topActors = sortDesc(
    [...actorCount.entries()].map(([actor, count]) => ({ actor, count })),
  ).slice(0, 10);
  const topActions = sortDesc(
    [...actionCount.entries()].map(([action, count]) => ({ action, count })),
  ).slice(0, 10);

  return {
    rowCount: rows.length,
    actorCount: actorCount.size,
    uniqueActions: actionCount.size,
    topActors,
    topActions,
    exceptions,
    span: earliest && latest
      ? { earliest: earliest.toISOString(), latest: latest.toISOString() }
      : null,
  };
}

export interface RenderAuditLogReportInput {
  rows: AuditLogReportRow[];
  filters: AuditLogReportFilters;
  /** ISO timestamp the report was generated. Caller supplies for determinism. */
  generatedAt: Date | string;
  /** "PRACTICE_NAME" on the cover. Defaults to the org id. */
  practiceLabel?: string;
}

export function renderAuditLogReportHtml(
  input: RenderAuditLogReportInput,
): string {
  const { rows, filters, generatedAt, practiceLabel } = input;
  const summary = summarizeAuditRows(rows);
  const since = asIso(filters.since ?? null);
  const until = asIso(filters.until ?? null);
  const generated =
    typeof generatedAt === "string" ? generatedAt : generatedAt.toISOString();

  const exceptionRows = (
    [
      ["Break-glass overrides (sensitive records)", summary.exceptions.breakGlass],
      ["Contraindication overrides", summary.exceptions.contraindicationOverride],
      ["Sensitive PHI views", summary.exceptions.sensitiveAccess],
      ["Bulk exports / downloads", summary.exceptions.bulkExport],
      ["Auth failures", summary.exceptions.authFailure],
    ] as Array<[string, number]>
  )
    .map(
      ([label, count]) => `
      <tr>
        <td>${escapeHtml(label)}</td>
        <td class="num ${count > 0 ? "flag" : ""}">${count}</td>
      </tr>`,
    )
    .join("");

  const detailRows = rows
    .map((r) => {
      const actor =
        r.actorEmail ?? r.actorUserId ?? r.actorAgent ?? "(unknown)";
      const subject =
        r.subjectType && r.subjectId
          ? `${r.subjectType}/${r.subjectId}`
          : r.subjectType ?? r.subjectId ?? "—";
      const metadata = r.metadata
        ? escapeHtml(stableStringify(r.metadata)).slice(0, 320)
        : "";
      return `
      <tr>
        <td class="ts">${escapeHtml(fmtDateTime(r.at))}</td>
        <td>${escapeHtml(actor)}</td>
        <td>${escapeHtml(r.action)}</td>
        <td>${escapeHtml(subject)}</td>
        <td class="meta">${metadata}</td>
      </tr>`;
    })
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Audit Log Report — ${escapeHtml(practiceLabel ?? filters.organizationName ?? filters.organizationId ?? "Leafjourney")}</title>
  <style>
    @page { size: Letter; margin: 0.6in; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif; color: #1a1a1a; font-size: 10pt; line-height: 1.4; }
    h1 { font-size: 22pt; margin: 0 0 0.2em; }
    h2 { font-size: 13pt; margin: 1.5em 0 0.4em; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; }
    h3 { font-size: 11pt; margin: 1em 0 0.3em; color: #555; }
    .cover { padding: 1em 0 2em; border-bottom: 2px solid #2e7d32; }
    .cover .sub { color: #666; font-style: italic; }
    .meta-row { display: flex; gap: 2em; flex-wrap: wrap; margin-top: 0.8em; font-size: 9.5pt; }
    .meta-row .k { color: #888; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.04em; }
    table { width: 100%; border-collapse: collapse; font-size: 9pt; }
    th, td { text-align: left; padding: 0.3em 0.5em; border-bottom: 1px solid #eee; vertical-align: top; }
    th { background: #f7f7f7; font-weight: 600; border-bottom: 1.5px solid #ccc; }
    td.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.num.flag { color: #b71c1c; font-weight: 600; }
    td.ts { white-space: nowrap; font-variant-numeric: tabular-nums; color: #555; }
    td.meta { font-family: ui-monospace, SF Mono, Menlo, monospace; font-size: 8pt; color: #555; word-break: break-all; }
    .footnote { margin-top: 2em; font-size: 8.5pt; color: #666; border-top: 1px solid #ccc; padding-top: 0.6em; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.8em; margin: 0.4em 0 0.8em; }
    .summary-grid .card { border: 1px solid #eee; border-radius: 4px; padding: 0.5em 0.7em; background: #fafafa; }
    .summary-grid .card .num { font-size: 16pt; font-weight: bold; color: #2e7d32; }
    .summary-grid .card .lbl { font-size: 8pt; color: #888; text-transform: uppercase; letter-spacing: 0.04em; }
  </style>
</head>
<body>
  <section class="cover">
    <h1>Audit Log Report</h1>
    <p class="sub">${escapeHtml(practiceLabel ?? filters.organizationName ?? "Leafjourney EMR")}</p>
    <div class="meta-row">
      <div>
        <div class="k">Generated</div>
        ${escapeHtml(fmtDateTime(generated))}
      </div>
      <div>
        <div class="k">From</div>
        ${since ? escapeHtml(fmtDateTime(since)) : "—"}
      </div>
      <div>
        <div class="k">Through</div>
        ${until ? escapeHtml(fmtDateTime(until)) : "—"}
      </div>
      <div>
        <div class="k">Rows</div>
        ${summary.rowCount.toLocaleString()}
      </div>
      <div>
        <div class="k">Actors</div>
        ${summary.actorCount}
      </div>
    </div>
  </section>

  <section>
    <h2>Filters applied</h2>
    <table>
      <tbody>
        ${filterRow("Organization", filters.organizationName ?? filters.organizationId)}
        ${filterRow("Patient", filters.patientLabel ?? filters.patientId)}
        ${filterRow("Actor", filters.actorUserId)}
        ${filterRow("Subject", filters.subjectType && filters.subjectId ? `${filters.subjectType}/${filters.subjectId}` : filters.subjectType ?? filters.subjectId ?? null)}
        ${filterRow("Action", filters.action)}
      </tbody>
    </table>
  </section>

  <section>
    <h2>Summary</h2>
    <div class="summary-grid">
      <div class="card"><div class="num">${summary.rowCount.toLocaleString()}</div><div class="lbl">Total events</div></div>
      <div class="card"><div class="num">${summary.actorCount}</div><div class="lbl">Unique actors</div></div>
      <div class="card"><div class="num">${summary.uniqueActions}</div><div class="lbl">Unique actions</div></div>
      <div class="card"><div class="num">${(summary.exceptions.breakGlass + summary.exceptions.contraindicationOverride + summary.exceptions.authFailure).toLocaleString()}</div><div class="lbl">Exceptions</div></div>
    </div>

    <h3>Exception counts</h3>
    <table>
      <thead><tr><th>Event class</th><th class="num">Count</th></tr></thead>
      <tbody>${exceptionRows}</tbody>
    </table>

    <h3>Top actors</h3>
    <table>
      <thead><tr><th>Actor</th><th class="num">Events</th></tr></thead>
      <tbody>
        ${
          summary.topActors
            .map(
              (a) => `<tr><td>${escapeHtml(a.actor)}</td><td class="num">${a.count}</td></tr>`,
            )
            .join("") || `<tr><td colspan="2"><em>No events in window.</em></td></tr>`
        }
      </tbody>
    </table>

    <h3>Top actions</h3>
    <table>
      <thead><tr><th>Action</th><th class="num">Count</th></tr></thead>
      <tbody>
        ${
          summary.topActions
            .map(
              (a) => `<tr><td>${escapeHtml(a.action)}</td><td class="num">${a.count}</td></tr>`,
            )
            .join("") || `<tr><td colspan="2"><em>No events in window.</em></td></tr>`
        }
      </tbody>
    </table>
  </section>

  <section>
    <h2>Detailed events (${rows.length})</h2>
    <table>
      <thead>
        <tr>
          <th>Timestamp (UTC)</th>
          <th>Actor</th>
          <th>Action</th>
          <th>Subject</th>
          <th>Metadata</th>
        </tr>
      </thead>
      <tbody>${detailRows || `<tr><td colspan="5"><em>No events match the filter.</em></td></tr>`}</tbody>
    </table>
  </section>

  <footer class="footnote">
    Satisfies HIPAA 45 CFR §164.312(b) audit controls — records and examines activity in systems that contain PHI.
    Report generated by Leafjourney Compliance Surface.
  </footer>
</body>
</html>`;
}

/** Helper for the renderer — emits a key/value row if value is set. */
function filterRow(label: string, value: string | null | undefined): string {
  if (!value) return "";
  return `<tr><td><strong>${escapeHtml(label)}</strong></td><td>${escapeHtml(value)}</td></tr>`;
}

/** Stable JSON for metadata. Avoids ordering wobble between runs. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Convenience: render the report as a CSV for back-office analytics
 * that prefer spreadsheets. CSV is a single sheet of detailed events
 * (the summary lives in the HTML/PDF variant).
 */
export function renderAuditLogReportCsv(rows: AuditLogReportRow[]): string {
  const header = [
    "at",
    "organizationId",
    "actorUserId",
    "actorEmail",
    "actorAgent",
    "actorRoles",
    "action",
    "subjectType",
    "subjectId",
    "reason",
    "metadata",
  ];
  const lines = [header.join(",")];
  for (const r of rows) {
    const cells = [
      fmtDateTime(r.at),
      r.organizationId ?? "",
      r.actorUserId ?? "",
      r.actorEmail ?? "",
      r.actorAgent ?? "",
      (r.actorRoles ?? []).join(";"),
      r.action,
      r.subjectType ?? "",
      r.subjectId ?? "",
      r.reason ?? "",
      r.metadata ? stableStringify(r.metadata) : "",
    ];
    lines.push(cells.map(csvCell).join(","));
  }
  return lines.join("\n") + "\n";
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
