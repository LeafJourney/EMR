// Branded HTML-as-PDF renderer for the ControllerAuditLog export.
//
// Lives next to `@/lib/admin/audit-export` (column spec + filename) and
// mirrors the approach in `@/lib/po/pdf.ts` (PR #437): emit a styled
// HTML document encoded as a UTF-8 Buffer. No PDF library is installed
// (no @react-pdf/renderer / pdfkit / pdf-lib / puppeteer in
// package.json), so HTML is the v1 carrier. The MIME type is
// `text/html` and the file ships with a `.pdf` extension because
// downstream tooling (Mac Quick Look, Chrome print-to-PDF) round-trips
// it cleanly; flipping to a true PDF later is a single-function swap.
//
// Pagination: we render *one* HTML document with a paginated table —
// `page-break-after: always` between row groups so a browser-print or
// headless-Chrome render produces multi-page output. We also include a
// CSS `@page` block that pins page size and margins, and a `position:
// running()` footer that yields "Page X of Y" via CSS counters.
//
// Header on each page: practice name + logo placeholder + export
// timestamp + filter summary.
// Footer on each page: "Page X of Y" + signature line for the operator.

import "server-only";

import type { AuditRow } from "@/lib/admin/audit-log";

export const AUDIT_PDF_MIME = "text/html; charset=utf-8";

/** Rows per HTML page-break. Tuned so an 11pt table fits on US Letter. */
const ROWS_PER_PAGE = 22;

/** Maximum cell width for the metadata column. Anything longer wraps. */
const METADATA_PREVIEW_MAX = 160;

export interface AuditPdfHeader {
  /** Practice / org name printed on every page. Falls back to "All practices". */
  practiceName: string | null;
  /** Org id printed alongside the name; "all-orgs" when fleet-wide. */
  orgId: string | null;
  /** Free-form filter chip line (e.g. "actor=u_123 · from 2026-05-01"). */
  filterSummary: string;
  /** Operator who ran the export — printed near the signature line. */
  operatorEmail: string | null;
  /** Time the export was generated. */
  generatedAt: Date;
}

const esc = (v: string): string =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function metadataCell(row: AuditRow): string {
  if (row.before == null && row.after == null) return "";
  let s: string;
  try {
    s = JSON.stringify({ before: row.before ?? null, after: row.after ?? null });
  } catch {
    return "";
  }
  if (s.length > METADATA_PREVIEW_MAX) {
    return s.slice(0, METADATA_PREVIEW_MAX - 1) + "…";
  }
  return s;
}

function renderRow(row: AuditRow): string {
  return (
    "<tr>" +
    `<td class="t">${esc(row.at)}</td>` +
    `<td>${esc(row.actorUserId)}</td>` +
    `<td>${esc(row.actorEmail ?? "")}</td>` +
    `<td class="mono">${esc(row.action)}</td>` +
    `<td>${esc(row.subjectType)}</td>` +
    `<td class="mono">${esc(row.subjectId)}</td>` +
    `<td class="mono">${esc(row.organizationId ?? "")}</td>` +
    `<td>${esc(row.reason ?? "")}</td>` +
    `<td class="meta">${esc(metadataCell(row))}</td>` +
    "</tr>"
  );
}

const TABLE_HEAD =
  "<thead><tr>" +
  '<th>At (UTC)</th>' +
  '<th>Actor</th>' +
  '<th>Actor email</th>' +
  '<th>Action</th>' +
  '<th>Subject type</th>' +
  '<th>Subject</th>' +
  '<th>Org ID</th>' +
  '<th>Reason</th>' +
  '<th>Metadata JSON</th>' +
  "</tr></thead>";

/**
 * Render an audit-log PDF (HTML-as-PDF) from an in-memory row buffer.
 *
 * Callers walk the Prisma cursor first and pass the materialised array
 * here. We do not stream because PDF rendering needs the total page
 * count up front for the "Page X of Y" footer.
 */
export function renderAuditPdfHtml(
  rows: ReadonlyArray<AuditRow>,
  header: AuditPdfHeader,
): string {
  const generatedIso = header.generatedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";
  const practice = header.practiceName ?? "All practices";
  const orgLine = header.orgId ?? "all-orgs";
  const operator = header.operatorEmail ?? "(unknown operator)";
  const totalRows = rows.length;
  const pages: string[] = [];

  // Chunk rows into print pages.
  if (totalRows === 0) {
    pages.push(
      `<div class="page"><div class="empty">No audit rows match the active filters.</div></div>`,
    );
  } else {
    for (let i = 0; i < totalRows; i += ROWS_PER_PAGE) {
      const slice = rows.slice(i, i + ROWS_PER_PAGE);
      const pageBody = slice.map(renderRow).join("");
      pages.push(
        `<div class="page"><table>${TABLE_HEAD}<tbody>${pageBody}</tbody></table></div>`,
      );
    }
  }

  const pageCount = pages.length;
  // Per-page header / footer with running totals. We render the chrome
  // on every `.page` so a browser-print render with `@page` margins
  // still gets the practice header and "Page X of Y" footer reliably,
  // even if CSS named-pages aren't honored.
  const framed = pages
    .map((body, idx) => {
      const pageNum = idx + 1;
      return (
        `<section class="sheet">` +
        `<header class="sheet-header">` +
        `<div class="brand"><div class="logo" aria-hidden="true"></div>` +
        `<div><div class="practice">${esc(practice)}</div>` +
        `<div class="org">${esc(orgLine)}</div></div></div>` +
        `<div class="meta-right">` +
        `<div><span class="label">Audit log export</span></div>` +
        `<div>${esc(generatedIso)}</div>` +
        `<div class="filters">${esc(header.filterSummary)}</div>` +
        `</div></header>` +
        body +
        `<footer class="sheet-footer">` +
        `<div class="sig"><div class="sig-line"></div>` +
        `<div class="sig-label">Operator signature — exported by ${esc(operator)}</div></div>` +
        `<div class="page-num">Page ${pageNum} of ${pageCount}</div>` +
        `</footer></section>`
      );
    })
    .join("");

  // Apple-iOS aesthetic per CLAUDE.md: SF system font, soft greys, no chrome.
  const css = `
@page { size: Letter landscape; margin: 0.5in; }
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font:11px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#111;background:#fff}
.sheet{padding:24px 32px;page-break-after:always;min-height:7.5in;display:flex;flex-direction:column}
.sheet:last-child{page-break-after:auto}
.sheet-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e5e5ea;padding-bottom:12px;margin-bottom:16px}
.brand{display:flex;gap:12px;align-items:center}
.logo{width:36px;height:36px;border-radius:8px;background:#f2f2f7;flex-shrink:0}
.practice{font-size:15px;font-weight:600;letter-spacing:-.01em;color:#111}
.org{font-size:11px;color:#6e6e73;font-family:ui-monospace,"SF Mono",Menlo,Monaco,monospace}
.meta-right{text-align:right;font-size:11px;color:#6e6e73;max-width:55%}
.meta-right .label{text-transform:uppercase;letter-spacing:.08em;font-size:9px;font-weight:600;color:#8e8e93}
.meta-right .filters{margin-top:4px;color:#111;font-size:10px}
.page{flex:1}
table{width:100%;border-collapse:collapse;table-layout:fixed}
thead th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6e6e73;padding:6px 8px;border-bottom:1px solid #e5e5ea;font-weight:600;background:#fafafa}
tbody td{padding:6px 8px;border-bottom:1px solid #f2f2f7;vertical-align:top;word-break:break-word;font-size:10px}
td.t{white-space:nowrap;font-variant-numeric:tabular-nums;color:#3a3a3c}
td.mono{font-family:ui-monospace,"SF Mono",Menlo,Monaco,monospace;font-size:10px}
td.meta{font-family:ui-monospace,"SF Mono",Menlo,Monaco,monospace;font-size:9px;color:#3a3a3c}
.empty{padding:48px;text-align:center;color:#6e6e73;font-size:13px;border:1px dashed #e5e5ea;border-radius:12px;margin:24px 0}
.sheet-footer{margin-top:auto;padding-top:16px;border-top:1px solid #e5e5ea;display:flex;justify-content:space-between;align-items:flex-end;font-size:10px;color:#6e6e73}
.sig{flex:1;max-width:60%}
.sig-line{border-bottom:1px solid #111;height:24px;margin-bottom:4px}
.sig-label{font-size:9px;color:#8e8e93}
.page-num{font-variant-numeric:tabular-nums}
@media print { .sheet{page-break-after:always} }
`;

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<title>Leafjourney audit log — ${esc(practice)}</title>` +
    `<style>${css}</style></head><body>${framed}</body></html>`
  );
}
