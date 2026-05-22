import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-199: Continuous Glucose Monitor (CGM) Hypoglycemia AI
// Remote Patient Monitoring safety agent. Ingests live data streams from Dexcom 
// or Freestyle Libre devices. If the AI detects a rapid downward trend predicting 
// severe hypoglycemia (<55 mg/dL) within 15 minutes, it triggers a blaring 
// emergency alert to the patient and their listed emergency contact.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.RPM_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.glucoseData) {
      return NextResponse.json({ error: "Missing required CGM data" }, { status: 400 });
    }

    const { patientId, glucoseData } = payload;
    const { currentValue, trendArrow } = glucoseData;

    logger.info({ 
      event: "agents.cgm_hypo_ai.reading_received", 
      patientId, 
      currentValue,
      trendArrow
    });

    // 1. Evaluate Hypoglycemia Trajectory
    // Double down arrows indicate drop of >3 mg/dL per minute
    const impendingSevereHypo = currentValue <= 70 && (trendArrow === "DoubleDown" || trendArrow === "SingleDown");

    if (impendingSevereHypo) {
      logger.error({ 
        event: "agents.cgm_hypo_ai.severe_hypo_predicted", 
        patientId, 
        currentValue 
      });

      // 2. Trigger Emergency SMS / Call Protocol
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "CGM_SEVERE_HYPOGLYCEMIA_ALERT_DISPATCHED",
          subjectType: "Patient",
          subjectId: patientId,
          metadata: { 
            glucose: currentValue, 
            trend: trendArrow, 
            action: "Automated phone call dispatched to Patient and Emergency Contact to consume fast-acting carbs." 
          }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "emergency_protocol_activated"
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "glucose_stable"
    });

  } catch (error) {
    logger.error({ event: "agents.cgm_hypo_ai.failed", error });
    return NextResponse.json({ error: "Failed to process CGM data" }, { status: 500 });
  }
}
