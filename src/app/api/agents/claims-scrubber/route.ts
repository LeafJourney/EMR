import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-045: Insurance Billing AI Agent (Claims Scrubber)
// Background agent that scrubs claims, pre-authorizes CPT codes, 
// and auto-flags denials for review.
export async function POST(req: Request) {
  try {
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

    let scrubbedCount = 0;
    let flaggedCount = 0;

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
        await prisma.claim.update({
          where: { id: claim.id },
          data: {
            status: "denied",
            denialReason,
            updatedAt: new Date(),
          },
        });
        flaggedCount++;
      } else if (claim.status === "draft") {
        // Auto-submit clean drafts
        await prisma.claim.update({
          where: { id: claim.id },
          data: {
            status: "submitted",
            updatedAt: new Date(),
          },
        });
      }

      scrubbedCount++;
    }

    logger.info({ event: "agents.claims_scrubber.completed", scrubbedCount, flaggedCount });
    
    return NextResponse.json({
      success: true,
      scrubbedCount,
      flaggedCount,
      message: `Scrubbed ${scrubbedCount} claims, flagged ${flaggedCount} for review.`
    });

  } catch (error) {
    logger.error({ event: "agents.claims_scrubber.failed", error });
    return NextResponse.json({ error: "Failed to scrub claims." }, { status: 500 });
  }
}
