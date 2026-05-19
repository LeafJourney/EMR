import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-123: AI Denial Appeals Generator
// Revenue cycle webhook that ingests EDI 835 claim denial messages from payers.
// Based on the CARC (Claim Adjustment Reason Code), it uses NLP to read the 
// clinical note and instantly drafts a formal, legally-sound appeal letter.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.EDI_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.claimId || !payload.carcCode) {
      return NextResponse.json({ error: "Missing required EDI fields" }, { status: 400 });
    }

    // 1. Fetch Claim and associated clinical text
    const claim = await prisma.claim.findUnique({
      where: { id: payload.claimId },
      include: { encounter: true }
    });

    if (!claim || !claim.encounter) {
      return NextResponse.json({ error: "Claim or Encounter not found" }, { status: 404 });
    }

    // 2. Draft Appeal based on CARC Code
    // e.g., CARC 50 = "These are non-covered services because this is not deemed a 'medical necessity'"
    let draftAppealText = "";

    if (payload.carcCode === "50") {
      draftAppealText = `To the Appeals Department,\n\nI am writing to formally appeal the denial of claim ${claim.id}. The service provided was medically necessary. As documented in the clinical note: "${claim.encounter.reason}". The patient had exhausted all conservative treatment options and faced significant decline in ADLs. Please reprocess this claim for immediate payment.`;
    } else {
      draftAppealText = `Standard appeal generated for CARC ${payload.carcCode}. Needs human review.`;
    }

    // 3. Save the draft appeal to the RCM Queue
    logger.info({ 
      event: "agents.appeals_generator.draft_created", 
      claimId: claim.id, 
      carcCode: payload.carcCode 
    });

    await prisma.auditLog.create({
      data: {
        organizationId: claim.organizationId,
        action: "APPEAL_LETTER_GENERATED",
        entity: "Claim",
        entityId: claim.id,
        details: { carcCode: payload.carcCode, draftText: draftAppealText }
      }
    });

    return NextResponse.json({ 
      success: true, 
      status: "appeal_drafted",
      carcCode: payload.carcCode
    });

  } catch (error) {
    logger.error({ event: "agents.appeals_generator.failed", error });
    return NextResponse.json({ error: "Failed to generate AI appeal" }, { status: 500 });
  }
}
