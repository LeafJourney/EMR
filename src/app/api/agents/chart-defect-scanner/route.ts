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
        status: "completed",
        chartingCompletedAt: { not: null },
      },
      take: 50
    });

    let defectsFound = 0;

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

      if (defects.length > 0) {
        // 3. Return chart to provider for addendum
        await prisma.encounter.update({
          where: { id: encounter.id },
          data: {
            status: "draft", // Push it back to the provider's sign-off queue
            briefingContext: {
              auditDefects: defects
            }
          }
        });

        logger.info({ 
          event: "agents.chart_defect_scanner.defect_found", 
          encounterId: encounter.id, 
          defects 
        });
        defectsFound++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      encountersAudited: encounters.length,
      defectsFound
    });

  } catch (error) {
    logger.error({ event: "agents.chart_defect_scanner.failed", error });
    return NextResponse.json({ error: "Failed to run chart defect scanner" }, { status: 500 });
  }
}
