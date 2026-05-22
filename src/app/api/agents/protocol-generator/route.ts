import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-075: Patient Treatment Protocol Generator
// AI agent that reviews a patient's complex diagnosis (e.g., severe PTSD, Chronic Pain)
// and drafts a 6-month, step-therapy protocol. Includes titration schedules for 
// THC/CBD and check-in milestones.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.primaryDiagnosis) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Mocking the AI Protocol Generation
    const protocolDraft = {
      title: `${payload.primaryDiagnosis} - 6 Month Step Therapy`,
      phase1: "Weeks 1-4: High CBD tincture (20:1), 0.5mL PM. Establish baseline tolerability.",
      phase2: "Weeks 5-12: Introduce 1:1 CBD:THC ratio during breakthrough episodes.",
      phase3: "Weeks 13-24: Transition to sustained-release capsules if symptoms persist.",
      milestones: ["Week 4 Check-in", "Week 12 Efficacy Evaluation"]
    };

    // 2. Save the Protocol to the database (Assuming a structured JSON field or Protocol table)
    // We will attach it to the patient's record as a draft for provider review
    await prisma.patient.update({
      where: { id: payload.patientId },
      data: {
        treatmentGoals: JSON.stringify(protocolDraft)
      }
    });

    logger.info({ 
      event: "agents.protocol_generator.completed", 
      patientId: payload.patientId, 
      diagnosis: payload.primaryDiagnosis 
    });

    return NextResponse.json({ 
      success: true, 
      protocol: protocolDraft
    });

  } catch (error) {
    logger.error({ event: "agents.protocol_generator.failed", error });
    return NextResponse.json({ error: "Failed to generate treatment protocol" }, { status: 500 });
  }
}
