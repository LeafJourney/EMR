// Shared helpers for the branded audit-log export pipeline.
//
// Both the CSV (`/api/admin/audit/export`) and the PDF
// (`/api/admin/audit/export-pdf`) routes pull their column spec, filename
// builder, and filter-summary formatter from here so the two artifacts
// always describe the same rows in the same order.
//
// The brief (ux/audit-export-branded-csv-pdf) pins:
//   - Stable column order: At (UTC) / Actor / Actor email / Action /
//     Subject type / Subject / Org ID / Reason / Metadata JSON.
//   - File-name shape: `leafjourney-audit-{orgId}-{YYYY-MM-DD}-{HHMM}.{ext}`
//     where `{orgId}` falls back to `all-orgs` when the operator hasn't
//     scoped to a single tenant (super-admins frequently sweep the whole
//     fleet during an incident, and `all-orgs` is more legible than `null`
//     in a filename on someone's desktop).
//   - Filter summary string used as a header chip on the PDF and as the
//     `super_admin.csv_export` audit payload `filters` map on both.

import "server-only";

import type { AuditQuery, AuditRow } from "@/lib/admin/audit-log";
import type { CsvColumn } from "@/lib/admin/csv-export";
import { practiceIdColumn } from "@/lib/admin/csv-export";

/**
 * Stable column order shared by CSV and PDF exports. Header strings are
 * the operator-facing labels — internal field names never leak.
 *
 * `practiceIdColumn` tags the Org-ID accessor as the canonical practice_id
 * column so the `requirePracticeIdColumn` enforcement in
 * `streamCsvResponse` is satisfied without a duplicate alias column.
 */
export const AUDIT_EXPORT_COLUMNS: ReadonlyArray<CsvColumn<AuditRow>> = [
  { header: "At (UTC)", get: (r) => r.at },
  { header: "Actor", get: (r) => r.actorUserId },
  { header: "Actor email", get: (r) => r.actorEmail ?? "" },
  { header: "Action", get: (r) => r.action },
  { header: "Subject type", get: (r) => r.subjectType },
  { header: "Subject", get: (r) => r.subjectId },
  practiceIdColumn<AuditRow>("Org ID", (r) => r.organizationId ?? ""),
  { header: "Reason", get: (r) => r.reason ?? "" },
  {
    header: "Metadata JSON",
    get: (r) => {
      // Single-line, deterministic. The metadata-preview helper in the UI
      // masks PHI-shaped strings; here we ship the raw payload because the
      // export is super-admin-only and the full payload is sometimes
      // load-bearing during incident triage. If a row lacks both
      // before/after, emit an empty string rather than literal "null" so
      // spreadsheet imports stay tidy.
      const payload = {
        before: r.before ?? null,
        after: r.after ?? null,
      };
      if (payload.before == null && payload.after == null) return "";
      try {
        return JSON.stringify(payload);
      } catch {
        return "";
      }
    },
  },
];

/** YYYY-MM-DD in UTC. */
function utcDateStamp(now: Date): string {
  const y = now.getUTCFullYear().toString().padStart(4, "0");
  const m = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = now.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** HHMM in UTC. */
function utcTimeStamp(now: Date): string {
  const h = now.getUTCHours().toString().padStart(2, "0");
  const m = now.getUTCMinutes().toString().padStart(2, "0");
  return `${h}${m}`;
}

/**
 * Sanitise an org-id fragment for inclusion in a filename. Anything that
 * isn't a safe filename char (alnum / `.` / `_` / `-`) collapses to a
 * single dash, and we cap the length so a pathological orgId can't blow
 * past the Windows 255-char filename limit on its own.
 */
function safeOrgFragment(orgId: string | null | undefined): string {
  if (!orgId) return "all-orgs";
  const cleaned = orgId.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!cleaned) return "all-orgs";
  return cleaned.length > 40 ? cleaned.slice(0, 40) : cleaned;
}

/**
 * Build a branded filename for an audit export artifact.
 *
 * @example
 *   auditExportFilename({ orgId: "acme", ext: "csv", now })
 *   // → "leafjourney-audit-acme-2026-05-23-1342.csv"
 */
export function auditExportFilename(opts: {
  orgId: string | null | undefined;
  ext: "csv" | "pdf";
  now?: Date;
}): string {
  const now = opts.now ?? new Date();
  const org = safeOrgFragment(opts.orgId);
  return `leafjourney-audit-${org}-${utcDateStamp(now)}-${utcTimeStamp(now)}.${opts.ext}`;
}

/**
 * Human-readable summary of the active filters, used as the PDF header
 * chip and as the body line of the operator signature block. Returns
 * "all rows, no filters applied" when no filters are active so the line
 * never collapses to an empty string in the PDF.
 */
export function summariseAuditFilters(q: AuditQuery): string {
  const parts: string[] = [];
  if (q.actor) parts.push(`actor=${q.actor}`);
  if (q.action) parts.push(`action contains "${q.action}"`);
  if (q.target) parts.push(`target=${q.target}`);
  if (q.from) parts.push(`from ${q.from.toISOString().slice(0, 10)}`);
  if (q.to) parts.push(`to ${q.to.toISOString().slice(0, 10)}`);
  return parts.length ? parts.join(" · ") : "all rows, no filters applied";
}

/** Same filter map both routes attach to the `super_admin.csv_export` audit row. */
export function auditExportFilterMap(q: AuditQuery): Record<string, unknown> {
  return {
    actor: q.actor,
    action: q.action,
    target: q.target,
    from: q.from?.toISOString() ?? null,
    to: q.to?.toISOString() ?? null,
  };
}
