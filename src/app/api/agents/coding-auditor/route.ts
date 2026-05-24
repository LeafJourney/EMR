import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-119: AI Medical Coding Auditor
// Secondary revenue cycle agent that scans claims *after* the human coder (or auto-coder) 
// but before submission. Looks for "downcoding" or missed revenue opportunities 
// (e.g., catching missed smoking cessation counseling codes documented in the note).

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.coding_auditor.started" });

    // 1. Fetch claims drafted and ready for submission
    const draftClaims = await prisma.claim.findMany({
      where: { status: "draft" },
      include: { encounter: true },
      take: 50
    });

    let missedOpportunitiesFound = 0;

    for (const claim of draftClaims) {
      if (!claim.encounter?.reason) continue;

      const clinicalText = claim.encounter.reason.toLowerCase();
      const currentCpts = claim.cptCodes as any[];
      const suggestions = [];

      // 2. Mock NLP Check for missed codes
      if (clinicalText.includes("smoking cessation") || clinicalText.includes("counseled on quitting tobacco")) {
        const hasCode = currentCpts.some(c => c.code === "99406" || c.code === "99407");
        if (!hasCode) {
          suggestions.push("Suggested Add: 99406 (Smoking and tobacco use cessation counseling)");
        }
      }

      if (clinicalText.includes("advance care planning") || clinicalText.includes("living will discussed")) {
        const hasCode = currentCpts.some(c => c.code === "99497");
        if (!hasCode) {
          suggestions.push("Suggested Add: 99497 (Advance care planning, 30 min)");
        }
      }

      // 3. Flag Claim for review
      if (suggestions.length > 0) {
        await prisma.claim.update({
          where: { id: claim.id },
          data: {
            status: "scrub_blocked",
            // Assume we can append suggestions to notes
          }
        });

        logger.info({ 
          event: "agents.coding_auditor.missed_revenue_found", 
          claimId: claim.id, 
          suggestions 
        });
        missedOpportunitiesFound++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      claimsAudited: draftClaims.length,
      missedOpportunitiesFound
    });

  } catch (error) {
    logger.error({ event: "agents.coding_auditor.failed", error });
    return NextResponse.json({ error: "Failed to run AI coding auditor" }, { status: 500 });
  }
}
