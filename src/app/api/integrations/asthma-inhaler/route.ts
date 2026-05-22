import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-114: Wearable Asthma Inhaler Sync (Propeller Health)
// Webhook that ingests data from smart rescue inhalers (like Propeller Health). 
// Tracks the frequency of Albuterol puffs. If a patient exceeds >3 rescue puffs 
// in a 24-hour window, it instantly flags the Pulmonologist for a steroid step-up.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.INHALER_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.inhalerType || typeof payload.puffs24h !== "number") {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { patientId, inhalerType, puffs24h } = payload;

    logger.info({ 
      event: "integrations.asthma_inhaler.sync", 
      patientId, 
      puffs24h 
    });

    // 1. Evaluate Clinical Rule (Rule of Two / Rescue Overuse)
    if (inhalerType === "rescue" && puffs24h > 3) {
      logger.warn({ 
        event: "integrations.asthma_inhaler.overuse_detected", 
        patientId, 
        puffs24h 
      });

      // 2. Alert Provider Inbox
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "ASTHMA_RESCUE_OVERUSE_ALERT",
          subjectType: "Patient",
          subjectId: patientId,
          metadata: { 
            reason: `Patient used rescue inhaler ${puffs24h} times in 24h`,
            recommendedAction: "Evaluate for ICS steroid step-up" 
          }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "alert_fired",
        puffs24h
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "routine_logged"
    });

  } catch (error) {
    logger.error({ event: "integrations.asthma_inhaler.failed", error });
    return NextResponse.json({ error: "Failed to process inhaler sync" }, { status: 500 });
  }
}
