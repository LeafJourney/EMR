// GET /api/patients/[id]/export/pdf
//
// Returns a self-contained, print-styled HTML document for the patient's
// chart. The browser's native "Print → Save as PDF" produces the final
// PDF — this lets us deliver clean, paginated output without bundling a
// headless-Chrome dependency. The route is named /pdf because that is
// the user-visible artifact (HTML is the transport).
//
// Query params:
//   sections   Comma-separated section keys (see CHART_EXPORT_SECTIONS).
//   download   "1" to send Content-Disposition: attachment (forces
//              download of the .html). Omit to render inline (default —
//              the page can then call window.print()).
//
// EMR-785 — Chart download as .lfj and printable PDF.

import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import {
  parseSectionFlags,
  renderPrintableHtml,
  suggestFilename,
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
  const forceDownload = url.searchParams.get("download") === "1";

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
    format: forceDownload ? "html" : "pdf",
    selfService: access.selfService,
  });

  const html = renderPrintableHtml(pkg);
  const filename = suggestFilename(pkg, "html");

  const headers: Record<string, string> = {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Chart-Format": "leafjourney.chart/1.0",
  };
  if (forceDownload) {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  } else {
    headers["Content-Disposition"] = `inline; filename="${filename}"`;
  }

  return new NextResponse(html, { status: 200, headers });
}
