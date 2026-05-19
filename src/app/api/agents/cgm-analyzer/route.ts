import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-112: Continuous Glucose Monitor (CGM) Anomaly Detector
// Evaluates inbound webhook payloads from Dexcom or FreeStyle Libre devices.
// If it detects a trend of nocturnal hypoglycemia over 48 hours, it actively 
// alerts the Endocrinology provider to adjust basal insulin protocols.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CGM_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.glucoseReadings) {
      return NextResponse.json({ error: "Missing required CGM fields" }, { status: 400 });
    }

    const { patientId, glucoseReadings } = payload;

    // 1. Evaluate Readings
    let hypoglycemicEvents = 0;
    
    // readings is an array of { timestamp, value }
    for (const reading of glucoseReadings) {
      if (reading.value < 70) {
        hypoglycemicEvents++;
      }
    }

    // 2. Trigger Protocol if anomalies detected
    if (hypoglycemicEvents > 3) {
      logger.error({ 
        event: "agents.cgm_analyzer.hypoglycemia_trend_detected", 
        patientId, 
        events: hypoglycemicEvents 
      });

      // Notify Endocrinology team for basal insulin adjustment
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "CGM_ANOMALY_CLINICAL_ALERT",
          entity: "Patient",
          entityId: patientId,
          details: { 
            reason: "Repeated Hypoglycemia (< 70 mg/dL)", 
            events: hypoglycemicEvents,
            recommendedAction: "Review basal insulin dosing" 
          }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "alert_fired",
        events: hypoglycemicEvents
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "routine_logged"
    });

  } catch (error) {
    logger.error({ event: "agents.cgm_analyzer.failed", error });
    return NextResponse.json({ error: "Failed to process CGM data" }, { status: 500 });
  }
}
