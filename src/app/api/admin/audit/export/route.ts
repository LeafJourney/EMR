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
// Columns: at, actorEmail, actorRole (first), action, subjectType,
// subjectId, organizationId, practice_id (alias of organizationId — used
// by the csv-export utility's requirePracticeIdColumn enforcement).

import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { prisma } from "@/lib/db/prisma";
import {
  type AuditRow,
  iterateAuditRows,
  parseAuditQuery,
} from "@/lib/admin/audit-log";
import {
  type CsvColumn,
  practiceIdColumn,
  streamCsvResponse,
} from "@/lib/admin/csv-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COLUMNS: ReadonlyArray<CsvColumn<AuditRow>> = [
  { header: "At", get: (r) => r.at },
  { header: "Actor User ID", get: (r) => r.actorUserId },
  { header: "Actor Email", get: (r) => r.actorEmail ?? "" },
  { header: "Actor Role", get: (r) => (r.actorRoles[0] ?? "") },
  { header: "Action", get: (r) => r.action },
  { header: "Subject Type", get: (r) => r.subjectType },
  { header: "Subject ID", get: (r) => r.subjectId },
  { header: "Organization ID", get: (r) => r.organizationId ?? "" },
  // The csv-export utility enforces a `practice_id` column on every export.
  // We alias the same value here so the contract is satisfied without
  // duplicating data in a confusing way — see practiceIdColumn() for the
  // sentinel tag.
  practiceIdColumn<AuditRow>("Practice ID", (r) => r.organizationId ?? ""),
  { header: "Reason", get: (r) => r.reason ?? "" },
];

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

  return streamCsvResponse<AuditRow>({
    rows: iterateAuditRows(prisma, q),
    columns: COLUMNS,
    filename: "controller-audit-log",
    audit: {
      entity: "ControllerAuditLog",
      filters: {
        actor: q.actor,
        action: q.action,
        target: q.target,
        from: q.from?.toISOString() ?? null,
        to: q.to?.toISOString() ?? null,
      },
      actor: {
        id: actor.id,
        email: actor.email,
        roles: actor.roles,
        organizationId: actor.organizationId,
      },
    },
  });
}
