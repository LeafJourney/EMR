// EMR-747 — ControllerAuditLog list API.
//
// GET /api/admin/audit?actor=...&action=...&target=...&from=...&to=...&cursor=...&limit=...
//
// Super-admin only. Returns the page of rows + the next cursor. The core
// query module is in src/lib/admin/audit-log.ts; this route is just the
// auth gate, URL parsing, and JSON serialisation.
//
// Auth: requireApiAuth({ role: "super_admin" }). Non-super-admin callers
// get a 403 so we can alarm on attempted access.
//
// We deliberately do NOT audit READ access to the audit log here. That
// would create a runaway feedback loop (every read writes another row,
// which the next read enumerates, which writes another row, …). If we
// ever need a read trail it should land in a separate table.

import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { prisma } from "@/lib/db/prisma";
import { parseAuditQuery, runAuditQuery } from "@/lib/admin/audit-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireApiAuth({ role: "super_admin" });
  if (gate.error) return gate.error;

  const url = new URL(req.url);
  const q = parseAuditQuery(url.searchParams);

  const result = await runAuditQuery(prisma, q);
  return NextResponse.json(result);
}
