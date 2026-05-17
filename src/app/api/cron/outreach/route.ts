import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-033: Automated Patient Outreach
// Background cron that evaluates patient demographics and last visit dates
// to automatically send SMS/email reminders for annual wellness visits, lab work, or renewals.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Example Rule: Find patients whose MMJ card expires in the next 30 days
    const next30Days = new Date();
    next30Days.setDate(next30Days.getDate() + 30);

    const expiringPatients = await prisma.patient.findMany({
      where: {
        qualificationExpiresAt: {
          lte: next30Days,
          gte: new Date()
        }
      },
      take: 100
    });

    let emailsSent = 0;
    let smsSent = 0;

    for (const patient of expiringPatients) {
      if (patient.email) {
        // Send email logic (mocked)
        logger.info({ event: "outreach.email.sent", type: "renewal", patientId: patient.id });
        emailsSent++;
      }
      
      if (patient.phone) {
        // Send SMS logic (mocked)
        logger.info({ event: "outreach.sms.sent", type: "renewal", patientId: patient.id });
        smsSent++;
      }

      // Log the campaign interaction
      await prisma.outreachCampaign.create({
        data: {
          organizationId: patient.organizationId,
          name: "Annual Renewal Reminder",
          audienceSize: 1,
          status: "sent",
          content: "Your Leafjourney medical card expires soon. Click here to schedule a renewal."
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      patientsProcessed: expiringPatients.length,
      emailsSent,
      smsSent
    });

  } catch (error) {
    logger.error({ event: "cron.outreach.failed", error });
    return NextResponse.json({ error: "Failed to run outreach cron" }, { status: 500 });
  }
}
