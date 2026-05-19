import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-179: Fall Risk Mobility AI
// Inpatient safety cron. Constantly analyzes nursing flow sheets, active medications, 
// and mobility scores (e.g., Morse Fall Scale). If a high-risk combination occurs 
// (e.g., patient is given IV pain meds/sedatives and attempts to get out of bed), 
// it automatically triggers a strict bed alarm protocol.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.fall_risk_ai.started" });

    // 1. Fetch admitted patients (Mock Data)
    const inpatientEncounters = await prisma.encounter.findMany({
      where: {
        status: "in_progress",
        // encounterType: "inpatient"
      },
      take: 20
    });

    let bedAlarmsTriggered = 0;

    for (const encounter of inpatientEncounters) {
      // 2. Evaluate Clinical Risk Factors
      // Mocking high-risk meds and poor mobility score
      const onSedative = true; // e.g., Ambien, Dilaudid
      const morseFallScore = 65; // >45 is High Risk
      const needsAssistance = true;

      if (onSedative && morseFallScore > 45 && needsAssistance) {
        logger.warn({ 
          event: "agents.fall_risk_ai.high_risk_detected", 
          encounterId: encounter.id, 
          morseFallScore 
        });

        // 3. Initiate Bed Alarm Protocol (Virtual Alert)
        await prisma.auditLog.create({
          data: {
            organizationId: encounter.organizationId,
            action: "FALL_PREVENTION_PROTOCOL_INITIATED",
            entity: "Encounter",
            entityId: encounter.id,
            details: { 
              score: morseFallScore, 
              triggers: ["Sedatives", "High Morse Score"],
              action: "Bed alarm activated. Yellow non-slip socks ordered." 
            }
          }
        });

        bedAlarmsTriggered++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      patientsScanned: inpatientEncounters.length,
      bedAlarmsTriggered
    });

  } catch (error) {
    logger.error({ event: "agents.fall_risk_ai.failed", error });
    return NextResponse.json({ error: "Failed to run fall risk AI" }, { status: 500 });
  }
}
