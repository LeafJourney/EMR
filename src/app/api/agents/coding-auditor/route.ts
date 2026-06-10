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
    const recommendations: Array<{ claimId: string; suggestions: string[] }> = [];

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

      // ADVISORY ONLY — never change claim status. The previous version flipped
      // the claim to "scrub_blocked" (a real blocking status) off mock substring
      // rules with no human in the loop; repeated calls could stall the entire
      // billing pipeline. Collect suggestions for a coder to review/apply.
      if (suggestions.length > 0) {
        recommendations.push({ claimId: claim.id, suggestions });
        logger.info({
          event: "agents.coding_auditor.missed_revenue_found",
          claimId: claim.id,
          suggestions,
        });
        missedOpportunitiesFound++;
      }
    }

    return NextResponse.json({
      success: true,
      advisory: true,
      applied: false,
      claimsAudited: draftClaims.length,
      missedOpportunitiesFound,
      recommendations,
    });

  } catch (error) {
    logger.error({ event: "agents.coding_auditor.failed", error });
    return NextResponse.json({ error: "Failed to run AI coding auditor" }, { status: 500 });
  }
}
