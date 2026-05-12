// POST /api/foundation/grants — Foundation grant-application intake.
//
// The /foundation page renders an HTML form with `action="/api/foundation/grants"`
// and `method="post"` (progressive-enhancement; the form works without JS).
// Before this route existed, every grant application 404'd and the
// applicant's data was lost — found by find-and-fix pass 5.
//
// Until SMTP/CRM integration lands the route emits a structured logger
// event (foundation.grant_application) so ops can reconcile applications
// from log aggregation. Same pattern as /api/contact.
//
// Auth: public — the form is on a public marketing page (/foundation).
// Rate-limiting via Upstash is a TODO (see EPIC 1.3); for now the IP is
// captured in the structured log so abuse is observable.

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

interface ApplicationPayload extends Record<RequiredField, string> {
  ein501c3Verified?: string | null;
  conflictOfInterestDeclared?: string | null;
}

function readField(fd: FormData, name: string): string {
  const v = fd.get(name);
  if (typeof v !== "string") return "";
  return v.trim();
}

export async function POST(req: NextRequest) {
  let fd: FormData;
  try {
    fd = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_form_data" },
      { status: 400 },
    );
  }

  const application: Partial<ApplicationPayload> = {};
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
    // Send the user back to /foundation with an error query param so the
    // page can render a clear "fix this and resubmit" state.
    const url = new URL("/foundation", req.url);
    url.searchParams.set("error", "missing_fields");
    url.searchParams.set("fields", missing.join(","));
    return NextResponse.redirect(url, { status: 303 });
  }

  // Basic shape checks the HTML form already does, but a malicious client
  // can bypass them. Repeat server-side.
  const ein = application.ein!;
  if (!/^\d{2}-\d{7}$/.test(ein)) {
    const url = new URL("/foundation", req.url);
    url.searchParams.set("error", "invalid_ein");
    return NextResponse.redirect(url, { status: 303 });
  }

  const requestedDollars = Number(application.requestedDollars);
  if (!Number.isFinite(requestedDollars) || requestedDollars < 1) {
    const url = new URL("/foundation", req.url);
    url.searchParams.set("error", "invalid_amount");
    return NextResponse.redirect(url, { status: 303 });
  }

  // Log the application as a structured event. Replace this block with
  // a Prisma persist + SMTP send when the FoundationGrantApplication
  // table + Resend/SendGrid integration land.
  logger.info({
    event: "foundation.grant_application",
    organizationName: application.organizationName,
    ein,
    contactName: application.contactName,
    contactEmail: application.contactEmail,
    yearsActive: application.yearsActive,
    requestedDollars,
    populationServed: application.populationServed,
    programDescriptionPreview: application.programDescription?.slice(0, 200),
    ein501c3Verified: application.ein501c3Verified === "on",
    conflictOfInterestDeclared:
      application.conflictOfInterestDeclared === "on",
    ip:
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      null,
    receivedAt: new Date().toISOString(),
  });

  const success = new URL("/foundation", req.url);
  success.searchParams.set("submitted", "1");
  return NextResponse.redirect(success, { status: 303 });
}
