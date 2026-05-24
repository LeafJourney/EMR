// Branded clinician-side patient roster export.
//
// GET /api/clinic/patients/roster-export?format=csv|pdf
//
// Clinic-scoped: the route requires an authenticated user with an
// `organizationId` and only returns patients for that tenant. No
// super-admin powers; this is a clinician-facing analogue of the
// audit-log export so the same dropdown UX can ship on `/clinic/patients`.
//
// Why a sibling module: clinician roster columns are a different shape
// from the super-admin audit log (name, status, DOB, last visit,
// chart-readiness — never the raw audit payload). The CSV / PDF
// generators are the same primitives though — RFC-4180 escaping via
// `escapeCsvCell`, HTML-as-PDF rendering with the same Apple-iOS chrome
// from `audit-pdf`. We keep this module additive: it does not touch the
// existing API surface and the dropdown UI is new on the page.

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { escapeCsvCell } from "@/lib/admin/csv-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROW_CAP = 2000;

interface RosterRow {
  lastName: string;
  firstName: string;
  status: string;
  dateOfBirth: string | null;
  phone: string | null;
  lastVisit: string | null;
  completenessScore: number | null;
}

function utcStamp(now: Date): { date: string; time: string } {
  const y = now.getUTCFullYear().toString().padStart(4, "0");
  const m = (now.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = now.getUTCDate().toString().padStart(2, "0");
  const h = now.getUTCHours().toString().padStart(2, "0");
  const mm = now.getUTCMinutes().toString().padStart(2, "0");
  return { date: `${y}-${m}-${d}`, time: `${h}${mm}` };
}

function safeOrg(orgId: string): string {
  const c = orgId.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return c ? c.slice(0, 40) : "org";
}

const HTML_ESC = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const COLUMNS: ReadonlyArray<{ header: string; get: (r: RosterRow) => string }> = [
  { header: "Last name", get: (r) => r.lastName },
  { header: "First name", get: (r) => r.firstName },
  { header: "Status", get: (r) => r.status },
  { header: "Date of birth", get: (r) => r.dateOfBirth ?? "" },
  { header: "Phone", get: (r) => r.phone ?? "" },
  { header: "Last visit (UTC)", get: (r) => r.lastVisit ?? "" },
  {
    header: "Chart readiness",
    get: (r) => (r.completenessScore == null ? "" : `${r.completenessScore}%`),
  },
];

function renderCsv(rows: ReadonlyArray<RosterRow>): string {
  const headerRow = COLUMNS.map((c) => escapeCsvCell(c.header)).join(",");
  const body = rows
    .map((row) => COLUMNS.map((c) => escapeCsvCell(c.get(row))).join(","))
    .join("\r\n");
  return `${headerRow}\r\n${body}\r\n`;
}

function renderPdfHtml(opts: {
  rows: ReadonlyArray<RosterRow>;
  practiceName: string;
  orgId: string;
  generatedAt: Date;
  operatorEmail: string | null;
}): string {
  const { rows, practiceName, orgId, generatedAt, operatorEmail } = opts;
  const ROWS_PER_PAGE = 28;
  const generatedIso =
    generatedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const head =
    "<thead><tr>" +
    COLUMNS.map((c) => `<th>${HTML_ESC(c.header)}</th>`).join("") +
    "</tr></thead>";

  const pages: string[] = [];
  if (rows.length === 0) {
    pages.push(
      `<div class="page"><div class="empty">No patients to export.</div></div>`,
    );
  } else {
    for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) {
      const slice = rows.slice(i, i + ROWS_PER_PAGE);
      const body = slice
        .map(
          (r) =>
            "<tr>" +
            COLUMNS.map((c) => `<td>${HTML_ESC(c.get(r))}</td>`).join("") +
            "</tr>",
        )
        .join("");
      pages.push(`<div class="page"><table>${head}<tbody>${body}</tbody></table></div>`);
    }
  }

  const pageCount = pages.length;
  const op = operatorEmail ?? "(unknown clinician)";
  const framed = pages
    .map((body, idx) => {
      const n = idx + 1;
      return (
        `<section class="sheet">` +
        `<header class="sheet-header">` +
        `<div class="brand"><div class="logo" aria-hidden="true"></div>` +
        `<div><div class="practice">${HTML_ESC(practiceName)}</div>` +
        `<div class="org">${HTML_ESC(orgId)}</div></div></div>` +
        `<div class="meta-right">` +
        `<div><span class="label">Patient roster</span></div>` +
        `<div>${HTML_ESC(generatedIso)}</div>` +
        `<div class="filters">${rows.length} patient${rows.length === 1 ? "" : "s"}</div>` +
        `</div></header>` +
        body +
        `<footer class="sheet-footer">` +
        `<div class="sig"><div class="sig-line"></div>` +
        `<div class="sig-label">Clinician signature — exported by ${HTML_ESC(op)}</div></div>` +
        `<div class="page-num">Page ${n} of ${pageCount}</div>` +
        `</footer></section>`
      );
    })
    .join("");

  const css = `
@page { size: Letter portrait; margin: 0.5in; }
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{font:11px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,sans-serif;color:#111;background:#fff}
.sheet{padding:24px 32px;page-break-after:always;min-height:9.5in;display:flex;flex-direction:column}
.sheet:last-child{page-break-after:auto}
.sheet-header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #e5e5ea;padding-bottom:12px;margin-bottom:16px}
.brand{display:flex;gap:12px;align-items:center}
.logo{width:36px;height:36px;border-radius:8px;background:#f2f2f7;flex-shrink:0}
.practice{font-size:15px;font-weight:600;letter-spacing:-.01em;color:#111}
.org{font-size:11px;color:#6e6e73;font-family:ui-monospace,"SF Mono",Menlo,Monaco,monospace}
.meta-right{text-align:right;font-size:11px;color:#6e6e73}
.meta-right .label{text-transform:uppercase;letter-spacing:.08em;font-size:9px;font-weight:600;color:#8e8e93}
.meta-right .filters{margin-top:4px;color:#111;font-size:10px}
.page{flex:1}
table{width:100%;border-collapse:collapse}
thead th{text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#6e6e73;padding:6px 8px;border-bottom:1px solid #e5e5ea;font-weight:600;background:#fafafa}
tbody td{padding:6px 8px;border-bottom:1px solid #f2f2f7;font-size:11px}
.empty{padding:48px;text-align:center;color:#6e6e73;font-size:13px;border:1px dashed #e5e5ea;border-radius:12px;margin:24px 0}
.sheet-footer{margin-top:auto;padding-top:16px;border-top:1px solid #e5e5ea;display:flex;justify-content:space-between;align-items:flex-end;font-size:10px;color:#6e6e73}
.sig{flex:1;max-width:60%}
.sig-line{border-bottom:1px solid #111;height:24px;margin-bottom:4px}
.sig-label{font-size:9px;color:#8e8e93}
.page-num{font-variant-numeric:tabular-nums}
`;

  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"/>` +
    `<title>Patient roster — ${HTML_ESC(practiceName)}</title>` +
    `<style>${css}</style></head><body>${framed}</body></html>`
  );
}

export async function GET(req: NextRequest) {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return new Response(
      JSON.stringify({ error: "ORG_REQUIRED" }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL(req.url);
  const fmt = (url.searchParams.get("format") ?? "csv").toLowerCase();
  if (fmt !== "csv" && fmt !== "pdf") {
    return new Response(
      JSON.stringify({ error: "BAD_FORMAT", message: "format must be csv or pdf" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const patients = await prisma.patient.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      status: true,
      dateOfBirth: true,
      phone: true,
      chartSummary: { select: { completenessScore: true } },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: ROW_CAP,
  });

  const ids = patients.map((p) => p.id);
  const lastEncs = ids.length
    ? await prisma.encounter.findMany({
        where: { patientId: { in: ids }, status: "complete" },
        orderBy: { completedAt: "desc" },
        select: { patientId: true, completedAt: true },
        take: ids.length * 3,
      })
    : [];
  const lastByPatient = new Map<string, string>();
  for (const e of lastEncs) {
    if (!lastByPatient.has(e.patientId) && e.completedAt) {
      lastByPatient.set(e.patientId, e.completedAt.toISOString().slice(0, 10));
    }
  }

  const rows: RosterRow[] = patients.map((p) => ({
    lastName: p.lastName,
    firstName: p.firstName,
    status: p.status as string,
    dateOfBirth: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
    phone: p.phone ?? null,
    lastVisit: lastByPatient.get(p.id) ?? null,
    completenessScore: p.chartSummary?.completenessScore ?? null,
  }));

  const now = new Date();
  const stamp = utcStamp(now);
  const safe = safeOrg(orgId);
  const filename = `leafjourney-patient-roster-${safe}-${stamp.date}-${stamp.time}.${fmt}`;

  if (fmt === "csv") {
    const body = renderCsv(rows);
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  let practiceName = "Practice";
  try {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { name: true },
    });
    practiceName = org?.name ?? "Practice";
  } catch {
    // fall through to default
  }

  const html = renderPdfHtml({
    rows,
    practiceName,
    orgId,
    generatedAt: now,
    operatorEmail: user.email ?? null,
  });
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
