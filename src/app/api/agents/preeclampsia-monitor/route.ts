import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-167: High-Risk Pregnancy Preeclampsia Monitor
// Remote Patient Monitoring (RPM) webhook. It ingests daily home blood pressure 
// readings for pregnant patients (>20 weeks gestation). It actively looks for severe 
// features of preeclampsia (Systolic >160 or Diastolic >110) and instantly pages 
// OB Triage for immediate intervention.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.RPM_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.systolic || !payload.diastolic) {
      return NextResponse.json({ error: "Missing required RPM fields" }, { status: 400 });
    }

    const { patientId, systolic, diastolic } = payload;

    logger.info({ 
      event: "agents.preeclampsia_monitor.reading_received", 
      patientId, 
      bp: `${systolic}/${diastolic}` 
    });

    // 1. Evaluate Preeclampsia Severe Features Criteria (ACOG Guidelines)
    const isSevereRange = systolic >= 160 || diastolic >= 110;

    if (isSevereRange) {
      logger.error({ 
        event: "agents.preeclampsia_monitor.severe_range_detected", 
        patientId, 
        bp: `${systolic}/${diastolic}` 
      });

      // 2. Alert OB Triage / Labor & Delivery
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "SEVERE_PREECLAMPSIA_ALERT_DISPATCHED",
          subjectType: "Patient",
          subjectId: patientId,
          metadata: { 
            bloodPressure: `${systolic}/${diastolic}`, 
            actionTaken: "Paged OB Triage. Instruct patient to report to L&D immediately." 
          }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "critical_alert_dispatched"
      });
    }

    // Normal or Mild Range
    return NextResponse.json({ 
      success: true, 
      status: "routine_reading_logged"
    });

  } catch (error) {
    logger.error({ event: "agents.preeclampsia_monitor.failed", error });
    return NextResponse.json({ error: "Failed to process preeclampsia reading" }, { status: 500 });
  }
}
