import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-045: Insurance Billing AI Agent (Claims Scrubber)
// Background agent that scrubs claims, pre-authorizes CPT codes, 
// and auto-flags denials for review.
export async function POST(req: Request) {
  try {
    // Auth — this endpoint previously ran fully unauthenticated while mutating
    // claims. Require the shared agent secret (prod-gated to match sibling
    // routes; it no longer writes, so dev access is read-only/advisory).
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // We fetch "draft" or "pending" claims to scrub
    const claimsToScrub = await prisma.claim.findMany({
      where: {
        status: { in: ["draft", "submitted", "pending"] },
      },
      take: 100, // Batch limit
    });

    // ADVISORY ONLY — this agent must NOT change claim status. The previous
    // version auto-set claims to "denied" and auto-"submitted" clean drafts to
    // the payer off mock rules — a billing-integrity hazard. It now returns
    // scrub recommendations for a biller to review/apply. (EMR-045 follow-up.)
    let scrubbedCount = 0;
    let flaggedCount = 0;
    const recommendations: Array<{ claimId: string; action: "flag_denial" | "submit"; reason?: string }> = [];

    for (const claim of claimsToScrub) {
      // Mocking AI Scrubber Logic
      const cptCodes = (claim.cptCodes as Array<{ code: string; label: string }>) || [];
      const icd10Codes = (claim.icd10Codes as Array<{ code: string }>) || [];

      let hasError = false;
      let denialReason = "";

      // Rule 1: Missing ICD-10 codes for specific CPT codes
      if (cptCodes.some(c => c.code.startsWith("992")) && icd10Codes.length === 0) {
        hasError = true;
        denialReason = "E/M CPT Code requires at least one ICD-10 diagnosis code.";
      }

      // Rule 2: Invalid CPT modifiers (Mocked)
      if (cptCodes.some(c => c.code === "99211") && claim.billedAmountCents > 15000) {
        hasError = true;
        denialReason = "Billed amount exceeds allowable maximum for CPT 99211.";
      }

      if (hasError) {
        recommendations.push({ claimId: claim.id, action: "flag_denial", reason: denialReason });
        flaggedCount++;
      } else if (claim.status === "draft") {
        // Recommend submitting clean drafts — never auto-submit to the payer.
        recommendations.push({ claimId: claim.id, action: "submit" });
      }

      scrubbedCount++;
    }

    logger.info({ event: "agents.claims_scrubber.completed", scrubbedCount, flaggedCount, advisory: true });

    return NextResponse.json({
      success: true,
      advisory: true,
      applied: false,
      scrubbedCount,
      flaggedCount,
      recommendations,
      message: `Reviewed ${scrubbedCount} claims, ${flaggedCount} flagged. No claim status was changed — apply via the biller UI.`,
    });

  } catch (error) {
    logger.error({ event: "agents.claims_scrubber.failed", error });
    return NextResponse.json({ error: "Failed to scrub claims." }, { status: 500 });
  }
}
