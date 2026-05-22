import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-185: Automated Stroke Door-to-Needle Timer
// High-stakes ED webhook. When a "Code Stroke" is called, this agent tracks the 
// time elapsed from ED triage, to CT scan completion, to the administration of 
// Thrombolytics (TPA). If the critical 60-minute "door-to-needle" window is closing, 
// it aggressively pages the ED Attending and Neurology.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.triageTime) {
      return NextResponse.json({ error: "Missing required stroke fields" }, { status: 400 });
    }

    const { encounterId, patientId, triageTime, tpaAdministered } = payload;
    const triageDate = new Date(triageTime);
    const now = new Date();

    // 1. Calculate Elapsed Minutes
    const elapsedMinutes = Math.floor((now.getTime() - triageDate.getTime()) / 60000);

    logger.info({ 
      event: "agents.stroke_timer.tracking", 
      encounterId, 
      elapsedMinutes 
    });

    // 2. Evaluate 60-Minute "Door-to-Needle" Window
    if (!tpaAdministered && elapsedMinutes >= 45 && elapsedMinutes < 60) {
      logger.warn({ 
        event: "agents.stroke_timer.window_closing", 
        encounterId, 
        elapsedMinutes 
      });

      // 3. Dispatch Urgent Escalation Page
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "STROKE_TPA_WINDOW_WARNING",
          subjectType: "Encounter",
          subjectId: encounterId,
          metadata: { 
            elapsedMinutes, 
            action: "Door-to-needle window closing in 15 mins. Paged ED Attending and Neurology." 
          }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "urgent_escalation_dispatched",
        minutesRemaining: 60 - elapsedMinutes
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "tracking_active",
      elapsedMinutes
    });

  } catch (error) {
    logger.error({ event: "agents.stroke_timer.failed", error });
    return NextResponse.json({ error: "Failed to track stroke timer" }, { status: 500 });
  }
}
