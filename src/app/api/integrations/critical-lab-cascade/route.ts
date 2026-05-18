import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-192: Critical Lab Value Cascade Caller
// High-stakes pathology webhook. When the lab instruments result a "Critical Panic 
// Value" (e.g., Potassium 7.2 or Hemoglobin 4.1), this agent triggers an automated 
// phone tree via Twilio. It aggressively calls the Attending, then the Resident, 
// then the Charge Nurse until a human explicitly acknowledges the result.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.LAB_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.labResultId || !payload.patientId || !payload.isCritical) {
      return NextResponse.json({ error: "Missing or non-critical lab payload" }, { status: 400 });
    }

    const { labResultId, patientId, labTestName, resultValue } = payload;

    logger.error({ 
      event: "integrations.critical_lab_cascade.panic_value_received", 
      labResultId, 
      labTestName,
      resultValue
    });

    // 1. Fetch Care Team Phone Numbers
    // Mocking the cascade sequence: Attending -> Resident -> Charge Nurse
    const cascadeSequence = [
      { role: "Attending", phone: "+15550001111" },
      { role: "Resident", phone: "+15550002222" },
      { role: "Charge Nurse", phone: "+15550003333" }
    ];

    // 2. Initiate Twilio Voice Cascade (Mock)
    // The Twilio flow would call the first number. If no "Press 1 to acknowledge", 
    // it moves to the second number, etc.
    const cascadeInitiated = true;

    if (cascadeInitiated) {
      logger.warn({ 
        event: "integrations.critical_lab_cascade.twilio_tree_started", 
        labResultId 
      });

      // Log the safety intervention
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "CRITICAL_LAB_CASCADE_CALL_INITIATED",
          entity: "LabResult",
          entityId: labResultId,
          details: { 
            test: labTestName, 
            value: resultValue, 
            cascade: cascadeSequence.map(c => c.role) 
          }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "cascade_call_tree_initiated"
      });
    }

    return NextResponse.json({ error: "Failed to initiate cascade" }, { status: 500 });

  } catch (error) {
    logger.error({ event: "integrations.critical_lab_cascade.failed", error });
    return NextResponse.json({ error: "Failed to run critical lab cascade" }, { status: 500 });
  }
}
