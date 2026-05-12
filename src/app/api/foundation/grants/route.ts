// POST /api/foundation/grants — Foundation grant-application intake.
//
// The /foundation page renders an HTML form with
// `action="/api/foundation/grants"` and `method="post"` (progressive
// enhancement; works without JS). Before this route existed, every
// grant application 404'd and the applicant's data was lost.
// Found by find-and-fix pass 5.
//
// Until SMTP/CRM integration lands, this route emits a structured
// logger event (`foundation.grant_application`) so ops can reconcile
// applications from log aggregation. Same pattern as /api/contact.
//
// Auth: public — the form is on a public marketing page. Rate-limiting
// via Upstash is a TODO (EPIC 1.3); for now the IP is captured in the
// structured log so abuse is observable.

import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/observability/log";

const REQUIRED_FIELDS = [
  "organizationName",
  "ein",
  "contactName",
  "contactEmail",
  "yearsActive",
  "requestedDollars",
  "populationServed",
  "programDescription",
] as const;

type RequiredField = (typeof REQUIRED_FIELDS)[number];
type Application = Record<RequiredField, string> & {
  ein501c3Verified?: string | null;
  conflictOfInterestDeclared?: string | null;
};

function readField(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
}

function redirectWith(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/foundation", req.url);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return NextResponse.redirect(url, { status: 303 });
}

export async function POST(req: NextRequest) {
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid_form_data" }, { status: 400 });
  }

  const application = {} as Application;
  const missing: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    const v = readField(fd, field);
    if (!v) missing.push(field);
    application[field] = v;
  }
  application.ein501c3Verified = readField(fd, "ein501c3Verified") || null;
  application.conflictOfInterestDeclared =
    readField(fd, "conflictOfInterestDeclared") || null;

  if (missing.length > 0) {
    return redirectWith(req, { error: "missing_fields", fields: missing.join(",") });
  }

  if (!/^\d{2}-\d{7}$/.test(application.ein)) {
    return redirectWith(req, { error: "invalid_ein" });
  }

  const requestedDollars = Number(application.requestedDollars);
  if (!Number.isFinite(requestedDollars) || requestedDollars < 1) {
    return redirectWith(req, { error: "invalid_amount" });
  }

  // Replace with a Prisma persist + Resend/SendGrid send when those
  // integrations land. Until then ops reconciles from structured logs.
  logger.info({
    event: "foundation.grant_application",
    organizationName: application.organizationName,
    ein: application.ein,
    contactName: application.contactName,
    contactEmail: application.contactEmail,
    yearsActive: application.yearsActive,
    requestedDollars,
    populationServed: application.populationServed,
    programDescriptionPreview: application.programDescription.slice(0, 200),
    ein501c3Verified: application.ein501c3Verified === "on",
    conflictOfInterestDeclared: application.conflictOfInterestDeclared === "on",
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null,
    receivedAt: new Date().toISOString(),
  });

  return redirectWith(req, { submitted: "1" });
}
