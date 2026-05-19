import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-173: Emergency Department Left Without Being Seen (LWBS) Predictor
// Operations webhook. Constantly analyzes ED waiting room times, patient acuity 
// (ESI triage level), and historical abandon rates. If a patient is flagged as 
// highly likely to leave without treatment, it pages the Charge Nurse to intervene.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.lwbs_predictor.started" });

    // 1. Fetch patients currently waiting in the ED
    const waitingPatients = await prisma.encounter.findMany({
      where: {
        status: "scheduled", // Proxy for 'waiting'
        // encounterType: "emergency"
      },
      take: 50
    });

    let interventionsTriggered = 0;

    for (const patient of waitingPatients) {
      // 2. Mock LWBS Risk Calculation
      const waitTimeMinutes = 120; // Mock: patient has been waiting 2 hours
      const esiLevel = 3; // Urgent
      
      let isHighRisk = false;

      // Patients with ESI 3 waiting > 90 mins have a massive drop-off rate
      if (esiLevel <= 3 && waitTimeMinutes > 90) {
        isHighRisk = true;
      }

      if (isHighRisk) {
        logger.warn({ 
          event: "agents.lwbs_predictor.high_risk_flagged", 
          encounterId: patient.id, 
          waitTimeMinutes 
        });

        // 3. Page ED Charge Nurse / Triage
        await prisma.auditLog.create({
          data: {
            organizationId: patient.organizationId,
            action: "ED_LWBS_INTERVENTION_ALERT",
            entity: "Encounter",
            entityId: patient.id,
            details: { 
              waitTimeMinutes, 
              esiLevel, 
              action: "Patient at extreme risk of elopement. Initiate comfort rounding or fast-track rooming." 
            }
          }
        });

        interventionsTriggered++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      waitingRoomScanned: waitingPatients.length,
      interventionsTriggered
    });

  } catch (error) {
    logger.error({ event: "agents.lwbs_predictor.failed", error });
    return NextResponse.json({ error: "Failed to run LWBS predictor" }, { status: 500 });
  }
}
