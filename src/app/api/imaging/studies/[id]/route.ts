import { NextResponse } from "next/server";
import {
  getReportForStudy,
  getStudy,
  listAnnotations,
} from "@/lib/domain/medical-imaging-store";
import { requireApiAuth } from "@/lib/auth/api-gate";

interface Ctx {
  params: { id: string };
}

export async function GET(_req: Request, { params }: Ctx) {
  // PHI surface — gate before reading the study.
  const gate = await requireApiAuth();
  if (gate.error) return gate.error;

  const study = getStudy(params.id);
  if (!study) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({
    study,
    annotations: listAnnotations(study.id),
    report: getReportForStudy(study.id),
  });
}
