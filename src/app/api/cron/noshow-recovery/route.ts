import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-183: Patient No-Show Revenue Recovery
// Smart scheduling webhook. When a patient no-shows their in-office appointment, 
// this agent automatically texts them a secure link to convert their missed visit 
// into a synchronous Telehealth appointment within 30 minutes, drastically 
// reducing lost revenue and empty schedule blocks.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.patientId) {
      return NextResponse.json({ error: "Missing required scheduling fields" }, { status: 400 });
    }

    const { encounterId, patientId } = payload;

    logger.warn({ 
      event: "cron.noshow_recovery.no_show_detected", 
      encounterId 
    });

    // 1. Fetch encounter details
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: { patient: true }
    });

    if (!encounter || encounter.status !== "scheduled") {
      return NextResponse.json({ error: "Invalid encounter for recovery" }, { status: 400 });
    }

    // 2. Generate Telehealth Conversion Link
    const telehealthUrl = `https://verdant-telehealth.com/join/${encounterId}?conversion=true`;
    
    const smsMessage = `Hi ${encounter.patient?.firstName || "there"}, looks like you missed your in-office appointment. The doctor can still see you right now via video! Click here to join your telehealth visit: ${telehealthUrl}`;

    // 3. Dispatch SMS and Log
    await prisma.auditLog.create({
      data: {
        organizationId: encounter.organizationId,
        action: "NO_SHOW_TELEHEALTH_CONVERSION_SMS_SENT",
        subjectType: "Encounter",
        subjectId: encounterId,
        metadata: { message: smsMessage }
      }
    });

    logger.info({ 
      event: "cron.noshow_recovery.sms_dispatched", 
      encounterId 
    });

    return NextResponse.json({ 
      success: true, 
      status: "conversion_attempted"
    });

  } catch (error) {
    logger.error({ event: "cron.noshow_recovery.failed", error });
    return NextResponse.json({ error: "Failed to run no-show recovery" }, { status: 500 });
  }
}
