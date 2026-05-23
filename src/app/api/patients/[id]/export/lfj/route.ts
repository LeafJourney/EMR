// GET /api/patients/[id]/export/lfj
//
// Streams a structured `.lfj` (Leafjourney chart) JSON download for the
// requested patient. Authorized for clinicians in the patient's org OR
// for the patient themselves. Section selection comes from `?sections=`
// (comma-separated keys) — omit to include every section.
//
// EMR-785 — Chart download as .lfj and printable PDF.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import {
  parseSectionFlags,
  suggestFilename,
  toLfjJson,
  LFJ_MIME_TYPE,
} from "@/lib/domain/chart-export";
import {
  resolveChartExportAccess,
  loadChartExport,
  recordChartExportAudit,
} from "@/lib/domain/chart-export-load";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(request: Request, { params }: Params) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let access;
  try {
    access = await resolveChartExportAccess(user, params.id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "ERROR";
    const status = message === "NOT_FOUND" ? 404 : message === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: message.toLowerCase() }, { status });
  }

  const url = new URL(request.url);
  const sections = parseSectionFlags(url.searchParams.get("sections"));

  const pkg = await loadChartExport({
    patientId: access.patientId,
    organizationId: access.organizationId,
    sections,
    practiceName: user.organizationName ?? "Leafjourney",
    preparedBy: `${user.firstName} ${user.lastName}`.trim() || user.email,
    preparedByRole: access.selfService ? "patient" : (user.roles[0] ?? "clinician"),
  });

  await recordChartExportAudit({
    organizationId: access.organizationId,
    actorUserId: user.id,
    patientId: access.patientId,
    sections: pkg.meta.sections,
    format: "lfj",
    selfService: access.selfService,
  });

  const body = toLfjJson(pkg);
  const filename = suggestFilename(pkg, "lfj");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": LFJ_MIME_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "X-Chart-Format": "leafjourney.chart/1.0",
    },
  });
}
