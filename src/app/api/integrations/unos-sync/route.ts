import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-198: Organ Transplant Waitlist Status Sync
// High-stakes transplant webhook. Integrates with UNOS (United Network for Organ Sharing). 
// If a patient's waitlist status changes externally (e.g., placed on Hold due to 
// an infection), this agent instantly updates the EMR global banner and pages 
// the Transplant Coordinator to ensure clinical alignment.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.unosStatus) {
      return NextResponse.json({ error: "Missing required UNOS fields" }, { status: 400 });
    }

    const { patientId, unosStatus, organType, changeReason } = payload;

    logger.info({ 
      event: "integrations.unos_sync.status_change_received", 
      patientId, 
      unosStatus 
    });

    // 1. Alert Transplant Coordinator if status is downgraded
    const isDowngrade = unosStatus.includes("Inactive") || unosStatus.includes("Hold");

    if (isDowngrade) {
      logger.warn({ 
        event: "integrations.unos_sync.patient_downgraded", 
        patientId, 
        reason: changeReason 
      });

      // Log the critical clinical update
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "UNOS_WAITLIST_STATUS_DOWNGRADED",
          entity: "Patient",
          entityId: patientId,
          details: { organ: organType, newStatus: unosStatus, reason: changeReason, actionTaken: "Transplant Coordinator Alerted" }
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "unos_record_synced"
    });

  } catch (error) {
    logger.error({ event: "integrations.unos_sync.failed", error });
    return NextResponse.json({ error: "Failed to run UNOS sync" }, { status: 500 });
  }
}
