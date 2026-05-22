import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-090: Telemetry AI Triage
// High-frequency webhook endpoint that receives continuous telemetry data 
// (e.g., Apple Watch ECG, Holter monitors) and uses AI to triage acute 
// cardiac events (like Atrial Fibrillation) to an on-call physician.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.TELEMETRY_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.telemetryData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Evaluate incoming telemetry (Mock AI assessment)
    const { heartRate, rhythmStatus, source } = payload.telemetryData;
    let isEmergency = false;
    let alertReason = "";

    if (heartRate > 150) {
      isEmergency = true;
      alertReason = "Tachycardia (HR > 150)";
    } else if (rhythmStatus === "AFib") {
      isEmergency = true;
      alertReason = "Atrial Fibrillation Detected";
    }

    if (isEmergency) {
      // 2. Trigger On-Call Escalation
      logger.error({ 
        event: "agents.telemetry_triage.emergency_alert", 
        patientId: payload.patientId, 
        reason: alertReason,
        source 
      });

      // Insert an urgent priority task in the provider's inbox
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "EMERGENCY_TELEMETRY_ALERT",
          subjectType: "Patient",
          subjectId: payload.patientId,
          metadata: { reason: alertReason, heartRate, source }
        }
      });
      
      // In production, trigger Twilio voice call or PagerDuty to the on-call MD
    } else {
      // Just log the routine data
      logger.info({ 
        event: "agents.telemetry_triage.routine_logged", 
        patientId: payload.patientId 
      });
    }

    return NextResponse.json({ 
      success: true, 
      isEmergency,
      alertReason
    });

  } catch (error) {
    logger.error({ event: "agents.telemetry_triage.failed", error });
    return NextResponse.json({ error: "Failed to process telemetry data" }, { status: 500 });
  }
}
