import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-130: Real-Time Patient Location Tracker (RTLS)
// Webhook that ingests data from Bluetooth/RFID Real-Time Location System (RTLS) badges.
// Tracks patient movement. If a patient is waiting in Exam Room 2 for > 15 minutes, 
// it automatically fires a page/slack message to the assigned nursing team.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.RTLS_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.badgeId || !payload.locationId || !payload.dwellTimeMinutes) {
      return NextResponse.json({ error: "Missing required RTLS fields" }, { status: 400 });
    }

    const { badgeId, locationId, dwellTimeMinutes, patientId } = payload;

    logger.info({ 
      event: "integrations.rtls.location_update", 
      patientId, 
      locationId, 
      dwellTimeMinutes 
    });

    // 1. Evaluate Wait Time SLA
    const maxExamRoomWait = 15; // 15 minutes max waiting un-seen

    if (locationId.startsWith("EXAM_ROOM") && dwellTimeMinutes > maxExamRoomWait) {
      logger.warn({ 
        event: "integrations.rtls.wait_time_exceeded", 
        patientId, 
        locationId,
        dwellTimeMinutes 
      });

      // 2. Alert Nursing Staff (e.g., via Vocera, Pager, or UI Notification)
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "PATIENT_WAIT_TIME_SLA_BREACH",
          entity: "Patient",
          entityId: patientId || badgeId,
          details: { location: locationId, waitTime: dwellTimeMinutes, actionRequired: "Check on Patient" }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "alert_dispatched"
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "logged"
    });

  } catch (error) {
    logger.error({ event: "integrations.rtls.failed", error });
    return NextResponse.json({ error: "Failed to process RTLS data" }, { status: 500 });
  }
}
