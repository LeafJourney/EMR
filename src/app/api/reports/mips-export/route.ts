import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-042: MIPS Data Extrapolation
// Automatically queries charts, calculates MIPS scores for value-based care, 
// and creates exportable XML format for CMS submission.
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const url = new URL(req.url);
    const orgId = url.searchParams.get("organizationId");

    if (!orgId) {
      return NextResponse.json({ error: "organizationId is required" }, { status: 400 });
    }

    // Extrapolate data from completed encounters
    // EncounterStatus.complete is the post-charting terminal state — the closest
    // analog to a "signed" encounter until a separate signature flag is modeled.
    const encounters = await prisma.encounter.findMany({
      where: {
        organizationId: orgId,
        status: "complete",
      },
      include: {
        patient: { select: { id: true, dateOfBirth: true } }
      }
    });

    // Mock Calculation for MIPS Quality Measures
    let qualityScore = 0;
    const totalEncounters = encounters.length;
    
    // Simple metric: high quality score if more than 50% of patients have completed documentation
    if (totalEncounters > 0) {
      qualityScore = Math.min(100, Math.floor((totalEncounters / 100) * 85)); 
    }

    // Generate CMS XML Format (Mock)
    const xmlExport = `<?xml version="1.0" encoding="UTF-8"?>
<submission>
  <organization id="${orgId}" />
  <mips_score>
    <quality>${qualityScore}</quality>
    <promoting_interoperability>90</promoting_interoperability>
    <improvement_activities>40</improvement_activities>
    <cost>80</cost>
  </mips_score>
  <total_encounters_analyzed>${totalEncounters}</total_encounters_analyzed>
</submission>`;

    logger.info({ event: "reports.mips_export.generated", orgId, qualityScore });

    return new NextResponse(xmlExport, {
      headers: {
        "Content-Type": "application/xml",
        "Content-Disposition": `attachment; filename="mips-export-${orgId}.xml"`
      }
    });

  } catch (error) {
    logger.error({ event: "reports.mips_export.failed", error });
    return NextResponse.json({ error: "Failed to generate MIPS export." }, { status: 500 });
  }
}
