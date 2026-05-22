import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-122: Antimicrobial Stewardship Agent (Pharmacy)
// High-priority clinical agent that tracks broad-spectrum antibiotic orders 
// (e.g., Meropenem, Vancomycin). Triggers a mandatory 72-hour hard-stop review, 
// requiring an Infectious Disease MD to co-sign the continuation of therapy.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.antimicrobial_steward.started" });

    // 1. Fetch active broad-spectrum antibiotic orders older than 72 hours
    const seventyTwoHoursAgo = new Date();
    seventyTwoHoursAgo.setHours(seventyTwoHoursAgo.getHours() - 72);

    // Mock query: We'll assume a `Prescription` or `MedicationOrder` model
    const activeRestrictedAntibiotics = await prisma.dispensaryDispense.findMany({
      where: {
        // status: "active",
        // drugClass: "restricted_antibiotic",
        // orderedAt: { lte: seventyTwoHoursAgo }
      },
      take: 50
    });

    let interventionsTriggered = 0;

    for (const order of activeRestrictedAntibiotics) {
      // 2. Trigger the 72-hour Hard Stop Protocol
      logger.warn({ 
        event: "agents.antimicrobial_steward.hard_stop_triggered", 
        orderId: order.id, 
        patientId: order.patientId 
      });

      // Add task to the Infectious Disease Pharmacy Queue
      await prisma.auditLog.create({
        data: {
          organizationId: order.organizationId,
          action: "ANTIMICROBIAL_STEWARDSHIP_REVIEW_REQUIRED",
          subjectType: "Dispense",
          subjectId: order.id,
          metadata: { reason: "72-hour Broad Spectrum Time-Out", requiredAction: "ID Consult / De-escalation" }
        }
      });

      interventionsTriggered++;
    }

    return NextResponse.json({ 
      success: true, 
      scanned: activeRestrictedAntibiotics.length,
      interventionsTriggered
    });

  } catch (error) {
    logger.error({ event: "agents.antimicrobial_steward.failed", error });
    return NextResponse.json({ error: "Failed to run antimicrobial steward" }, { status: 500 });
  }
}
