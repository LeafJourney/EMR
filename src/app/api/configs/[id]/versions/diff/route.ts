// EMR-471 — GET /api/configs/[id]/versions/diff?from=N&to=M
//
// Returns a side-by-side, top-level-key diff between two published snapshots of
// a practice configuration, reusing the same diff renderer the audit-log detail
// page uses (buildAuditDiff). Powers the "compare versions" view that sits in
// front of the EMR-472 rollback action. Implementation Admin only.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireImplementationAdmin } from "@/lib/auth/super-admin";
import { buildAuditDiff, summariseDiff } from "@/lib/admin/audit-diff";
import { withAuthErrors, notFound } from "../../../_helpers";

export const runtime = "nodejs";

interface Ctx {
  params: { id: string };
}

export async function GET(req: Request, { params }: Ctx) {
  return (await withAuthErrors(async () => {
    await requireImplementationAdmin();

    const url = new URL(req.url);
    const from = Number(url.searchParams.get("from"));
    const to = Number(url.searchParams.get("to"));
    if (!Number.isInteger(from) || !Number.isInteger(to)) {
      return NextResponse.json(
        {
          error: "invalid_versions",
          message: "Query params `from` and `to` must be integer version numbers.",
        },
        { status: 400 },
      );
    }

    const rows = await prisma.practiceConfigurationVersion.findMany({
      where: { configurationId: params.id, version: { in: [from, to] } },
      select: { version: true, snapshot: true },
    });
    const fromRow = rows.find((r) => r.version === from);
    const toRow = rows.find((r) => r.version === to);
    if (!fromRow || !toRow) return notFound();

    const lines = buildAuditDiff(fromRow.snapshot, toRow.snapshot);

    return NextResponse.json({
      configurationId: params.id,
      from,
      to,
      summary: summariseDiff(lines),
      lines,
    });
  })) as NextResponse;
}
