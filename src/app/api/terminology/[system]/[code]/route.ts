// EMR-766 — Terminology lookup endpoint.
//
// GET /api/terminology/:system/:code
//   :system ∈ { loinc, snomed, rxnorm, icd10 }
//
// Returns 200 { code, display, system, version } on hit, 404 on miss,
// 400 on unknown system.

import { NextResponse } from "next/server";
import { lookup, isTerminologySystem } from "@/lib/terminology";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { system: string; code: string } },
) {
  const { system, code } = params;

  if (!isTerminologySystem(system)) {
    return NextResponse.json(
      {
        error: "unknown_terminology_system",
        message: `unknown terminology system "${system}"`,
        allowed: ["loinc", "snomed", "rxnorm", "icd10"],
      },
      { status: 400 },
    );
  }

  const hit = lookup(system, decodeURIComponent(code));
  if (!hit) {
    return NextResponse.json(
      { error: "code_not_found", system, code },
      { status: 404 },
    );
  }

  return NextResponse.json(hit, {
    headers: {
      // 24h client cache — see ADR-006 (terminology service freshness rules).
      "Cache-Control": "public, max-age=86400",
    },
  });
}
