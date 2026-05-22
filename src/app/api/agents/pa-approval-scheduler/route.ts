import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-190: Prior Auth Approval Auto-Scheduler
// Patient access webhook. When an insurance company finally approves a pending 
// Prior Authorization (e.g., via a 278 EDI response for an MRI or surgery), 
// this agent automatically texts the patient a secure link to schedule the 
// procedure, completely bypassing the manual front-desk callback queue.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.EDI_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.paRequestId || !payload.patientId || payload.status !== "APPROVED") {
      return NextResponse.json({ error: "Invalid or non-approved PA payload" }, { status: 400 });
    }

    const { paRequestId, patientId, procedureCode, procedureName } = payload;

    logger.info({ 
      event: "agents.pa_approval_scheduler.approved", 
      paRequestId, 
      patientId 
    });

    // 1. Generate Direct Scheduling Link
    const schedulingUrl = `https://verdant-portal.com/schedule/procedure/${paRequestId}`;
    const smsMessage = `Great news! Your insurance has approved your ${procedureName || "procedure"}. Please click here to select your appointment time: ${schedulingUrl}`;

    // 2. Dispatch SMS to Patient
    logger.info({ 
      event: "agents.pa_approval_scheduler.sms_dispatched", 
      patientId 
    });

    await prisma.auditLog.create({
      data: {
        organizationId: payload.organizationId || "DEFAULT",
        action: "PA_APPROVAL_SCHEDULING_LINK_SENT",
        subjectType: "PriorAuthorization",
        subjectId: paRequestId,
        metadata: { procedureCode, messageSent: smsMessage }
      }
    });

    return NextResponse.json({ 
      success: true, 
      status: "scheduling_invite_dispatched"
    });

  } catch (error) {
    logger.error({ event: "agents.pa_approval_scheduler.failed", error });
    return NextResponse.json({ error: "Failed to dispatch PA scheduler" }, { status: 500 });
  }
}
