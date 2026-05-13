// EMR-064 — Audit log PDF / CSV export endpoint.
//
// GET /api/audit/report?subjectId=&organizationId=&since=&until=&action=&format=html|csv
//
// Gated by `requireImplementationAdmin` (super_admin or implementation_admin).
// Returns a print-ready HTML document (which the browser can save as PDF
// via Cmd-P) or a CSV download for spreadsheet analysis.
//
// This endpoint does NOT page — by design, compliance exports want the
// entire result set in one artifact. Caller is responsible for choosing
// a reasonable date window. We do still cap at MAX_ROWS as a guardrail
// against accidental practice-wide pulls.

import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import {
  renderAuditLogReportCsv,
  renderAuditLogReportHtml,
  type AuditLogReportRow,
} from "@/lib/compliance/audit-log-report";

export const runtime = "nodejs";

const MAX_ROWS = 5000;

const queryInput = z.object({
  subjectId: z.string().min(1).optional(),
  organizationId: z.string().min(1).optional(),
  actorUserId: z.string().min(1).optional(),
  action: z.string().min(1).optional(),
  since: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "invalid ISO date")
    .optional(),
  until: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), "invalid ISO date")
    .optional(),
  format: z.enum(["html", "csv"]).optional(),
});

function asError(status: number, error: string): NextResponse {
  return NextResponse.json({ error }, { status });
}

export async function GET(req: Request): Promise<NextResponse | Response> {
  try {
    await requireImplementationAdmin();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHORIZED") return asError(401, "unauthorized");
    if (msg === "FORBIDDEN") return asError(403, "forbidden");
    throw err;
  }

  const url = new URL(req.url);
  const raw = Object.fromEntries(url.searchParams.entries());
  const parsed = queryInput.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { subjectId, organizationId, actorUserId, action, since, until } =
    parsed.data;
  const format = parsed.data.format ?? "html";

  const where: Prisma.AuditLogWhereInput = {};
  if (subjectId) where.subjectId = subjectId;
  if (organizationId) where.organizationId = organizationId;
  if (actorUserId) where.actorUserId = actorUserId;
  if (action) where.action = action;
  if (since || until) {
    where.createdAt = {};
    if (since) where.createdAt.gte = new Date(since);
    if (until) where.createdAt.lte = new Date(until);
  }

  const dbRows = await prisma.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: MAX_ROWS,
  });

  const rows: AuditLogReportRow[] = dbRows.map((r) => ({
    id: r.id,
    at: r.createdAt,
    organizationId: r.organizationId,
    actorUserId: r.actorUserId,
    actorAgent: r.actorAgent,
    action: r.action,
    subjectType: r.subjectType,
    subjectId: r.subjectId,
    metadata: (r.metadata ?? null) as Record<string, unknown> | null,
  }));

  if (format === "csv") {
    const csv = renderAuditLogReportCsv(rows);
    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  const html = renderAuditLogReportHtml({
    rows,
    filters: {
      organizationId: organizationId ?? null,
      actorUserId: actorUserId ?? null,
      action: action ?? null,
      subjectId: subjectId ?? null,
      since: since ?? null,
      until: until ?? null,
    },
    generatedAt: new Date(),
  });

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
    },
  });
}
