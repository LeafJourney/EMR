// Client-safe CSV + print helpers for the DataTable primitive.
//
// MASTER prompt (Owner Portal Revisions) G6: "Have the ability to 'send' or
// 'print' or 'Download' any table on any page that includes all the data and
// the 'column' and 'row' titles."
//
// Kept dependency-free and client-safe (no server-only imports) so it ships in
// the browser bundle alongside <DataTable>. The heavier server/audit export
// path lives in src/lib/admin/csv-export.ts and is a separate concern.

export type CellValue = string | number | boolean | null | undefined;

// UTF-8 BOM — makes Excel open accented characters correctly.
const UTF8_BOM = "\uFEFF";

/**
 * Escape a single CSV cell per RFC-4180, plus an Excel/Sheets formula-injection
 * guard: cells beginning with `=`, `+`, `-`, `@`, tab, or CR are prefixed with a
 * single quote so a downloaded financial export can't execute as a formula.
 */
export function escapeCsvCell(value: CellValue): string {
  if (value == null) return "";
  let s = typeof value === "string" ? value : String(value);
  if (s.length === 0) return "";
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  // RFC-4180 quoting trigger: comma, quote, CR, or LF.
  if (/[",\r\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build an RFC-4180 CSV string from a header row plus body rows. */
export function buildCsv(headers: string[], rows: CellValue[][]): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCsvCell).join(","));
  return lines.join("\r\n");
}

/**
 * Trigger a browser download of `csv` as `filename`. Prepends a UTF-8 BOM.
 * No-op outside the browser.
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([UTF8_BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&quot;",
  );
}

/** Build a minimal, print-styled HTML document for a table (column + row titles). */
export function tableToPrintableHtml(
  title: string,
  headers: string[],
  rows: CellValue[][],
): string {
  const th = headers.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
  const trs = rows
    .map(
      (r) =>
        `<tr>${r
          .map((c) => `<td>${escapeHtml(c == null ? "" : String(c))}</td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(
    title,
  )}</title><style>
    body{font:13px -apple-system,system-ui,sans-serif;color:#111;margin:24px}
    h1{font-size:16px;margin:0 0 12px}
    table{border-collapse:collapse;width:100%}
    th,td{border:1px solid #ccc;padding:6px 10px;text-align:left}
    thead th{background:#f3f4f6;font-weight:600}
    tbody tr:nth-child(even){background:#fafafa}
    @media print{body{margin:0}}
  </style></head><body><h1>${escapeHtml(
    title,
  )}</h1><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></body></html>`;
}

/**
 * Open a print dialog for the given table in a new window. No-op outside the
 * browser or if the popup is blocked.
 */
export function printTable(
  title: string,
  headers: string[],
  rows: CellValue[][],
): void {
  if (typeof window === "undefined") return;
  const html = tableToPrintableHtml(title, headers, rows);
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  w.print();
}
