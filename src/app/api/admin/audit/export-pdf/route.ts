// Branded PDF export of the ControllerAuditLog.
//
// GET /api/admin/audit/export-pdf?<same filters as /api/admin/audit>
//
// Super-admin only. Renders the same row set as the CSV sibling using a
// shared column spec from `@/lib/admin/audit-export`, then emits a
// styled HTML-as-PDF document via `@/lib/admin/audit-pdf`.
//
// Why HTML-as-PDF: no PDF library is installed (see `@/lib/po/pdf.ts`
// for the same reasoning on the supply-order pipeline). The artifact
// ships with `.pdf` in the filename so Mac Quick Look, Chrome
// print-to-PDF, and Linear attachments round-trip cleanly. A real PDF
// library can be swapped in without changing the route surface.
//
// Audit: we write a `super_admin.csv_export` controller-audit row
// before the response body is built, with `format: "pdf"` in the after-
// snapshot so support can grep across exports by artifact type. The
// audit row mirrors the CSV-export contract verbatim so cross-route
// queries stay simple.

import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { prisma } from "@/lib/db/prisma";
import { logControllerAction } from "@/lib/auth/audit-stub";
import {
  type AuditRow,
  iterateAuditRows,
  parseAuditQuery,
} from "@/lib/admin/audit-log";
import {
  auditExportFilename,
  auditExportFilterMap,
  summariseAuditFilters,
} from "@/lib/admin/audit-export";
import { AUDIT_PDF_MIME, renderAuditPdfHtml } from "@/lib/admin/audit-pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hard cap on rows materialised into a single PDF. The PDF generator
 * needs the total row count up front (for "Page X of Y"), so unlike the
 * CSV stream we buffer in memory. 5000 rows at our average row size is
 * ~3MB of HTML; well under the Render-tier memory headroom and still
 * comfortably faster than a user would expect a single PDF to take to
 * download. Above this we tell the operator to narrow filters or use
 * the CSV export, which streams.
 */
const PDF_ROW_CAP = 5000;

export async function GET(req: NextRequest) {
  const gate = await requireApiAuth({ role: "super_admin" });
  if (gate.error) return gate.error;
  const actor = gate.actor;

  const url = new URL(req.url);
  url.searchParams.delete("cursor");
  const q = parseAuditQuery(url.searchParams);

  // Walk rows. Cap defended above; over-cap requests get a 413 with
  // operator-readable copy so the page can render a friendly toast.
  const rows: AuditRow[] = [];
  for await (const row of iterateAuditRows(prisma, q)) {
    rows.push(row);
    if (rows.length > PDF_ROW_CAP) {
      return new Response(
        JSON.stringify({
          error: "PDF_ROW_CAP_EXCEEDED",
          message:
            `Result set exceeds the ${PDF_ROW_CAP}-row PDF cap. Narrow the filters or use the CSV export, which streams.`,
          cap: PDF_ROW_CAP,
        }),
        {
          status: 413,
          headers: { "Content-Type": "application/json; charset=utf-8" },
        },
      );
    }
  }

  // Resolve practice name for the header. The audit query may scope to
  // a specific org via `target`; otherwise the export is fleet-wide and
  // we print "All practices". We don't fail the export when the org
  // lookup fails — the artifact stays useful even if the name resolve
  // has a transient hiccup.
  const orgIdForHeader = q.target ?? actor.organizationId ?? null;
  let practiceName: string | null = null;
  if (orgIdForHeader) {
    try {
      const org = await prisma.organization.findUnique({
        where: { id: orgIdForHeader },
        select: { name: true },
      });
      practiceName = org?.name ?? null;
    } catch {
      practiceName = null;
    }
  }

  const generatedAt = new Date();
  const filename = auditExportFilename({
    orgId: orgIdForHeader,
    ext: "pdf",
    now: generatedAt,
  });
  const filterSummary = summariseAuditFilters(q);

  // Audit row — written before the body so a transport hiccup still
  // leaves a trail of who exported what. We mirror the CSV-export
  // contract and add a `format` discriminator.
  await logControllerAction({
    actor: {
      id: actor.id,
      email: actor.email,
      roles: actor.roles,
      organizationId: actor.organizationId,
    },
    action: "super_admin.csv_export",
    targetId: "ControllerAuditLog",
    after: {
      entity: "ControllerAuditLog",
      format: "pdf",
      filename,
      filters: auditExportFilterMap(q),
      rowCount: rows.length,
    },
  });

  const html = renderAuditPdfHtml(rows, {
    practiceName,
    orgId: orgIdForHeader,
    filterSummary,
    operatorEmail: actor.email ?? null,
    generatedAt,
  });

  const safeFull = filename.replace(/[^A-Za-z0-9._-]+/g, "-");
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": AUDIT_PDF_MIME,
      "Content-Disposition": `attachment; filename="${safeFull}"`,
      "Cache-Control": "no-store",
    },
  });
}
