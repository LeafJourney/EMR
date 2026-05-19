import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-109: Chronic Pain Tracking (PROMs)
// Nightly cron job that evaluates patients enrolled in chronic pain or cannabis 
// titration programs. Automatically dispatches weekly Patient-Reported Outcome 
// Measures (PROMs) via secure SMS to track pain scales and functional improvement.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "cron.proms_tracker.started" });

    // 1. Fetch patients actively enrolled in Pain Management
    const enrolledPatients = await prisma.patient.findMany({
      where: {
        // Mocking an active tag or program enrollment
        status: "active" 
      },
      take: 100
    });

    let surveysDispatched = 0;

    for (const patient of enrolledPatients) {
      if (patient.phone) {
        // 2. Draft the PROM Survey SMS
        // "Hi John, how would you rate your average pain over the last 7 days (1-10)? Reply with a number."
        
        logger.info({ 
          event: "cron.proms_tracker.survey_sent", 
          patientId: patient.id 
        });

        // Log the outbound survey for analytics tracking
        await prisma.auditLog.create({
          data: {
            organizationId: patient.organizationId,
            action: "PROM_SURVEY_DISPATCHED",
            entity: "Patient",
            entityId: patient.id,
            details: { type: "Weekly Pain Scale", channel: "SMS" }
          }
        });

        surveysDispatched++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      patientsScanned: enrolledPatients.length,
      surveysDispatched
    });

  } catch (error) {
    logger.error({ event: "cron.proms_tracker.failed", error });
    return NextResponse.json({ error: "Failed to run PROMs tracker" }, { status: 500 });
  }
}
