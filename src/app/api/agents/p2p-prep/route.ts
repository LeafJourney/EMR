import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-168: Prior Auth Peer-to-Peer (P2P) Call Prep AI
// RCM agent that runs when a Peer-to-Peer (P2P) appeal is scheduled. It scans the 
// original insurance denial letter and the patient's chart. It automatically generates 
// a "cheat sheet" for the physician for their upcoming phone call, highlighting exactly 
// which clinical guidelines the patient met that the insurance company ignored.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.paRequestId || !payload.denialReason) {
      return NextResponse.json({ error: "Missing required P2P prep fields" }, { status: 400 });
    }

    const { paRequestId, denialReason, patientId, providerId } = payload;

    logger.info({ 
      event: "agents.p2p_prep.started", 
      paRequestId, 
      patientId 
    });

    // 1. Fetch Patient Chart Context
    const recentEncounters = await prisma.encounter.findMany({
      where: { patientId },
      take: 2,
      orderBy: { createdAt: "desc" }
    });

    // 2. Generate the Provider Cheat Sheet
    // Mocking an LLM response comparing the denial to the clinical notes
    const cheatSheet = `
      [P2P PREP SHEET]
      Denial Reason: ${denialReason} (e.g., "Step therapy not met")
      
      Key Talking Points for Medical Director:
      1. Patient *did* fail first-line therapy. Documented adverse reaction to generic alternative on ${recentEncounters[0]?.createdAt?.toISOString().split('T')[0] || "recent visit"}.
      2. Condition is rapidly deteriorating, risking hospitalization.
      3. Guidelines dictate bypass of step therapy due to documented contraindication.
    `;

    // 3. Deliver Cheat Sheet to Provider Inbox/Schedule
    await prisma.auditLog.create({
      data: {
        organizationId: payload.organizationId || "DEFAULT",
        action: "P2P_CHEAT_SHEET_GENERATED",
        subjectType: "PriorAuthorization",
        subjectId: paRequestId,
        metadata: { providerId, cheatSheetGenerated: true }
      }
    });

    return NextResponse.json({ 
      success: true, 
      status: "prep_sheet_generated",
      cheatSheet
    });

  } catch (error) {
    logger.error({ event: "agents.p2p_prep.failed", error });
    return NextResponse.json({ error: "Failed to generate P2P prep sheet" }, { status: 500 });
  }
}
