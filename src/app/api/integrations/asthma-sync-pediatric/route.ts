import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-178: Pediatric Asthma Inhaler Sync
// Remote Patient Monitoring (RPM) webhook. Integrates with Bluetooth-enabled 
// rescue inhalers (like Propeller Health). If a pediatric patient uses their 
// Albuterol more than 3 times a week, it indicates poor asthma control and 
// automatically queues a medication adjustment consult for the pediatrician.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.RPM_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.deviceData) {
      return NextResponse.json({ error: "Missing required device fields" }, { status: 400 });
    }

    const { patientId, deviceData } = payload;
    const { rescuePuffsLast7Days } = deviceData;

    logger.info({ 
      event: "integrations.asthma_sync.reading_received", 
      patientId, 
      rescuePuffsLast7Days 
    });

    // 1. Evaluate Asthma Control (Rule of 2s)
    // >2 times a week indicates poorly controlled asthma
    if (rescuePuffsLast7Days > 2) {
      logger.warn({ 
        event: "integrations.asthma_sync.poor_control_detected", 
        patientId, 
        puffs: rescuePuffsLast7Days 
      });

      // 2. Alert Pediatrician / Asthma Coordinator
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "ASTHMA_POOR_CONTROL_ALERT",
          entity: "Patient",
          entityId: patientId,
          details: { 
            rescueUsage: rescuePuffsLast7Days, 
            actionRequired: "Review controller medication (e.g., ICS dose increase). Contact family." 
          }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "intervention_queued"
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "well_controlled"
    });

  } catch (error) {
    logger.error({ event: "integrations.asthma_sync.failed", error });
    return NextResponse.json({ error: "Failed to process asthma data" }, { status: 500 });
  }
}
