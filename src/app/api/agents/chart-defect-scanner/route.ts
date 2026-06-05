import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-082: AI Chart Defect Scanner
// Pre-claim audit agent that scans signed clinician notes before they are sent to billing.
// It uses NLP to check for missing required elements (e.g., Chief Complaint, Review of Systems, 
// valid Electronic Signature) that would typically result in a payer denial.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.chart_defect_scanner.started" });

    // 1. Fetch recently signed encounters that haven't been billed yet
    const encounters = await prisma.encounter.findMany({
      where: {
        status: "complete",
        chartingCompletedAt: { not: null },
      },
      take: 50
    });

    let defectsFound = 0;
    const recommendations: Array<{ encounterId: string; defects: string[] }> = [];

    for (const encounter of encounters) {
      // 2. Mock NLP Chart Audit Logic
      const noteText = encounter.reason?.toLowerCase() || "";
      const defects = [];

      if (!noteText.includes("chief complaint") && !noteText.includes("cc:")) {
        defects.push("Missing Chief Complaint");
      }
      if (!noteText.includes("review of systems") && !noteText.includes("ros:")) {
        defects.push("Missing Review of Systems");
      }

      // ADVISORY ONLY — never un-sign a completed chart. The previous version
      // reverted signed encounters (status complete → in_progress) and clobbered
      // briefingContext off a substring check that fires on nearly every chart;
      // silently reverting a signed legal record is a record-integrity problem.
      // Surface defects for the provider to review/addend; perform no write.
      if (defects.length > 0) {
        recommendations.push({ encounterId: encounter.id, defects });
        logger.info({
          event: "agents.chart_defect_scanner.defect_found",
          encounterId: encounter.id,
          defects,
        });
        defectsFound++;
      }
    }

    return NextResponse.json({
      success: true,
      advisory: true,
      applied: false,
      encountersAudited: encounters.length,
      defectsFound,
      recommendations,
    });

  } catch (error) {
    logger.error({ event: "agents.chart_defect_scanner.failed", error });
    return NextResponse.json({ error: "Failed to run chart defect scanner" }, { status: 500 });
  }
}
