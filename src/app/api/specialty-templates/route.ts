// EMR-421 — GET /api/specialty-templates
//
// Returns the list of active specialty manifests for the wizard's step 2
// card grid. Server-side wrapper around `listActiveSpecialtyTemplates` so
// the client never imports the registry directly.

import { NextResponse } from "next/server";
import { listActiveSpecialtyTemplates } from "@/lib/specialty-templates/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const items = listActiveSpecialtyTemplates();
  return NextResponse.json({ items });
}
