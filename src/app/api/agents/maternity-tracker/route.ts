import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-118: Smart Maternity/OB Tracker
// Agent triggered when a new pregnancy is documented. Calculates the Estimated 
// Date of Delivery (EDD) and automatically generates the scheduling tasks for 
// milestone visits (e.g., 20-week anatomy scan, 28-week glucose, 36-week GBS).

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.lastMenstrualPeriod) {
      return NextResponse.json({ error: "Missing required OB fields" }, { status: 400 });
    }

    // 1. Calculate Estimated Date of Delivery (Naegele's rule)
    const lmp = new Date(payload.lastMenstrualPeriod);
    const edd = new Date(lmp);
    edd.setDate(edd.getDate() + 280); // 40 weeks

    logger.info({ 
      event: "agents.maternity_tracker.pregnancy_logged", 
      patientId: payload.patientId, 
      edd 
    });

    // 2. Generate Milestone Scheduling Tasks
    const milestones = [
      { name: "First Trimester Screening", weeks: 12 },
      { name: "Anatomy Ultrasound", weeks: 20 },
      { name: "Glucose Tolerance Test", weeks: 28 },
      { name: "GBS Swab & Birth Plan", weeks: 36 }
    ];

    const tasksToCreate = milestones.map(m => {
      const targetDate = new Date(lmp);
      targetDate.setDate(targetDate.getDate() + (m.weeks * 7));
      return {
        organizationId: payload.organizationId || "DEFAULT",
        action: "SCHEDULE_OB_MILESTONE",
        entity: "Patient",
        entityId: payload.patientId,
        details: { milestone: m.name, targetWeek: m.weeks, targetDate }
      };
    });

    // We use auditLog here as a proxy for a Task queue in this schema
    await prisma.auditLog.createMany({
      data: tasksToCreate
    });

    return NextResponse.json({ 
      success: true, 
      estimatedDateOfDelivery: edd.toISOString().split("T")[0],
      milestonesGenerated: milestones.length
    });

  } catch (error) {
    logger.error({ event: "agents.maternity_tracker.failed", error });
    return NextResponse.json({ error: "Failed to run maternity tracker" }, { status: 500 });
  }
}
