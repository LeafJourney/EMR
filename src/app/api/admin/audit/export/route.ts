// EMR-747 — ControllerAuditLog CSV export.
//
// GET /api/admin/audit/export?<same filters as /api/admin/audit>
//
// Super-admin only. Streams the entire filtered result set as CSV via
// the shared `streamCsvResponse` utility (EMR-749), which writes exactly
// one `super_admin.csv_export` audit row before the stream begins. The
// audit row carries the active filter set so we can correlate an
// exported file to the operator/intent that produced it.
//
// Column order and branded filename are shared with the PDF route
// (`/api/admin/audit/export-pdf`) via `@/lib/admin/audit-export` so both
// artifacts describe the same rows in the same order.

import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { prisma } from "@/lib/db/prisma";
import {
  type AuditRow,
  iterateAuditRows,
  parseAuditQuery,
} from "@/lib/admin/audit-log";
import { streamCsvResponse } from "@/lib/admin/csv-export";
import {
  AUDIT_EXPORT_COLUMNS,
  auditExportFilename,
  auditExportFilterMap,
} from "@/lib/admin/audit-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireApiAuth({ role: "super_admin" });
  if (gate.error) return gate.error;
  const actor = gate.actor;

  const url = new URL(req.url);
  // The cursor URL param means something specific in the list API; for the
  // export we always walk from the start of the filtered set so the file
  // is reproducible from the filter chips alone. Strip it before parsing.
  url.searchParams.delete("cursor");
  const q = parseAuditQuery(url.searchParams);

  // Org fragment for the filename. When the operator scopes to a single
  // tenant via the `target` filter we use that; otherwise the file is a
  // fleet-wide sweep and we encode that as `all-orgs` in the filename.
  const orgFragment = q.target ?? actor.organizationId ?? null;

  return streamCsvResponse<AuditRow>({
    rows: iterateAuditRows(prisma, q),
    columns: AUDIT_EXPORT_COLUMNS,
    filename: "leafjourney-audit",
    filenameOverride: auditExportFilename({ orgId: orgFragment, ext: "csv" }),
    audit: {
      entity: "ControllerAuditLog",
      filters: auditExportFilterMap(q),
      actor: {
        id: actor.id,
        email: actor.email,
        roles: actor.roles,
        organizationId: actor.organizationId,
      },
    },
  });
}
