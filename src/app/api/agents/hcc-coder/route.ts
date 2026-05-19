import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-193: Value-Based Care (VBC) HCC Coder
// Financial NLP agent. Scans clinical notes for chronic conditions (e.g., "uncomplicated 
// diabetes" or "morbid obesity") and suggests Hierarchical Condition Category (HCC) 
// ICD-10 codes to the provider. This ensures accurate Risk Adjustment Factor (RAF) 
// scoring, maximizing Medicare Advantage reimbursements.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.clinicalText) {
      return NextResponse.json({ error: "Missing required HCC fields" }, { status: 400 });
    }

    const { encounterId, patientId, clinicalText } = payload;
    const text = clinicalText.toLowerCase();

    logger.info({ 
      event: "agents.hcc_coder.scanning", 
      encounterId 
    });

    // 1. Mock NLP Extraction for HCC Risk Adjustment Categories
    const hccSuggestions = [];

    if (text.includes("type 2 diabetes") && text.includes("neuropathy")) {
      hccSuggestions.push({
        code: "E11.40",
        description: "Type 2 diabetes mellitus with diabetic neuropathy, unspecified",
        hccCategory: "HCC 18",
        rafWeight: 0.302
      });
    }

    if (text.includes("bmi") && text.includes("40")) {
      hccSuggestions.push({
        code: "E66.01",
        description: "Morbid (severe) obesity due to excess calories",
        hccCategory: "HCC 22",
        rafWeight: 0.250
      });
    }

    if (hccSuggestions.length > 0) {
      logger.info({ 
        event: "agents.hcc_coder.opportunities_found", 
        encounterId, 
        count: hccSuggestions.length 
      });

      // 2. Alert Provider in their UI to accept the codes
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "HCC_CODING_OPPORTUNITY_FLAGGED",
          entity: "Encounter",
          entityId: encounterId,
          details: { suggestions: hccSuggestions, status: "Pending Provider Acceptance" }
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      opportunitiesFound: hccSuggestions.length,
      suggestions: hccSuggestions
    });

  } catch (error) {
    logger.error({ event: "agents.hcc_coder.failed", error });
    return NextResponse.json({ error: "Failed to run HCC coder AI" }, { status: 500 });
  }
}
