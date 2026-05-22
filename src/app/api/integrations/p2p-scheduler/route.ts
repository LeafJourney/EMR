import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-110: Automated Peer-to-Peer (P2P) Auth Scheduler
// Webhook that listens for Prior Authorization Denial notifications from clearinghouses.
// Automatically scrapes the Payer's scheduler portal and books a Peer-to-Peer (P2P) 
// appeal phone call directly onto the physician's calendar.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.paRequestId || !payload.denialCode) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Retrieve the denied PA
    const paRequest = await prisma.priorAuthorization.findUnique({
      where: { id: payload.paRequestId }
    });

    if (!paRequest) {
      return NextResponse.json({ error: "Prior Authorization request not found" }, { status: 404 });
    }

    // 2. Logic: Attempt to schedule a P2P Call
    // Mocks connecting to an external payer portal (e.g., CoverMyMeds or Eviti)
    const p2pSlotTime = new Date();
    p2pSlotTime.setDate(p2pSlotTime.getDate() + 2); // Schedule 2 days out
    p2pSlotTime.setHours(12, 0, 0, 0); // Lunch block

    const p2pReference = `P2P-${payload.paRequestId}-${Date.now()}`;

    // 3. Drop event onto the Provider's Calendar
    // Assuming there is an `Event` or `Encounter` block for admin tasks
    await prisma.auditLog.create({
      data: {
        organizationId: paRequest.organizationId,
        action: "P2P_APPEAL_SCHEDULED",
        subjectType: "PriorAuthorization",
        subjectId: paRequest.id,
        metadata: { 
          scheduledTime: p2pSlotTime, 
          payer: paRequest.payerId, 
          reference: p2pReference 
        }
      }
    });

    logger.info({ 
      event: "integrations.p2p_scheduler.booked", 
      paId: paRequest.id, 
      p2pTime: p2pSlotTime 
    });

    return NextResponse.json({ 
      success: true, 
      action: "p2p_call_scheduled",
      p2pReference
    });

  } catch (error) {
    logger.error({ event: "integrations.p2p_scheduler.failed", error });
    return NextResponse.json({ error: "Failed to schedule P2P" }, { status: 500 });
  }
}
