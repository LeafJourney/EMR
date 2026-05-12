import { NextRequest, NextResponse } from "next/server";
import { listStudies } from "@/lib/domain/medical-imaging-store";
import { requireApiAuth } from "@/lib/auth/api-gate";

// PHI surface. Auth required — find-and-fix pass 4 found this route
// returning a list of imaging studies (patientId, modality, body part,
// indication) to anonymous callers. Closed 2026-05-12.
export async function GET(req: NextRequest) {
  const gate = await requireApiAuth();
  if (gate.error) return gate.error;

  const patientId = req.nextUrl.searchParams.get("patientId") ?? undefined;
  return NextResponse.json({ studies: listStudies(patientId) });
}
