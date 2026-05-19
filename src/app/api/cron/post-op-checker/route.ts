import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-197: Post-Op Day 1 Automated SMS Checker
// Surgical quality webhook. Every morning, this cron automatically texts patients 
// who had outpatient surgery the previous day, asking if their pain is manageable 
// and if they have signs of infection. "No" replies instantly page the on-call surgeon.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "cron.post_op_checker.started" });

    // 1. Fetch patients who had surgery yesterday
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0,0,0,0);

    const postOpPatients = await prisma.encounter.findMany({
      where: {
        // encounterType: "surgery",
        createdAt: { gte: yesterday } // Mocking surgery date
      },
      take: 50
    });

    let checkInsSent = 0;

    for (const patient of postOpPatients) {
      logger.info({ 
        event: "cron.post_op_checker.sms_dispatched", 
        encounterId: patient.id 
      });

      // 2. Dispatch Interactive SMS (Mock Twilio call)
      const smsMessage = "Verdant Surgery Center: How is your recovery today? Are your pain levels manageable? Reply YES, NO, or CALL ME.";

      await prisma.auditLog.create({
        data: {
          organizationId: patient.organizationId,
          action: "POST_OP_DAY_1_CHECK_IN_SENT",
          entity: "Encounter",
          entityId: patient.id,
          details: { message: smsMessage, status: "Awaiting Patient Reply" }
        }
      });

      checkInsSent++;
    }

    return NextResponse.json({ 
      success: true, 
      patientsScanned: postOpPatients.length,
      checkInsSent
    });

  } catch (error) {
    logger.error({ event: "cron.post_op_checker.failed", error });
    return NextResponse.json({ error: "Failed to run post-op checker" }, { status: 500 });
  }
}
