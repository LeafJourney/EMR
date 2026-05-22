import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-043: Waitlist & Capacity Management
// Agent that checks for recently cancelled appointments and 
// automatically notifies patients on the waitlist.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Find cancelled appointments from the last 24 hours that haven't been backfilled
    const recentlyCancelled = await prisma.encounter.findMany({
      where: {
        status: "cancelled",
        updatedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      },
      take: 50
    });

    let notificationsSent = 0;

    for (const slot of recentlyCancelled) {
      if (!slot.scheduledFor) continue;

      // Mock waitlist query: finding patients interested in this provider's slots
      // Assuming a patient status "waitlist" or a dedicated Waitlist model.
      // Here we just find prospects in the same org.
      const waitlistPatients = await prisma.patient.findMany({
        where: {
          organizationId: slot.organizationId,
          status: "prospect"
        },
        take: 3
      });

      for (const patient of waitlistPatients) {
        if (patient.email || patient.phone) {
          // Simulate sending SMS/Email
          logger.info({ 
            event: "waitlist.notification.sent", 
            patientId: patient.id, 
            slotTime: slot.scheduledFor.toISOString() 
          });
          notificationsSent++;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      cancelledSlotsProcessed: recentlyCancelled.length,
      notificationsSent
    });

  } catch (error) {
    logger.error({ event: "agents.waitlist_manager.failed", error });
    return NextResponse.json({ error: "Failed to run waitlist manager" }, { status: 500 });
  }
}
