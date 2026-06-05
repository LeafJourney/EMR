import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-101: Fall Risk ML Predictor (Geriatrics/SNF)
// AI Agent that analyzes recent medication changes (e.g., adding a CNS depressant) 
// combined with recent Physical Therapy notes to calculate a Fall Risk Score. 
// Automatically assigns high-risk patients to a "Bed Alarm Required" protocol.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.fall_risk_predictor.started" });

    // 1. Fetch patients in skilled nursing or geriatric units
    // Mock logic: patients over 65
    const geriatricPatients = await prisma.patient.findMany({
      where: {
        dateOfBirth: { lte: new Date(new Date().setFullYear(new Date().getFullYear() - 65)) }
      },
      take: 50
    });

    // ADVISORY ONLY — this agent must NOT write to the chart. The risk inputs
    // below are not yet wired to real medication / gait data; the previous
    // version hardcoded them to `true`, scoring EVERY geriatric patient at 85
    // and appending "HIGH FALL RISK" to patient.presentingConcerns plus an
    // auditLog "protocol activated" — polluting every chart. Until a real risk
    // model lands (EMR-101) it must not assert risk or mutate the chart; it
    // returns Bed-Alarm recommendations for clinician review only.
    const recommendations: Array<{ patientId: string; riskScore: number }> = [];

    for (const patient of geriatricPatients) {
      // TODO(EMR-101): score from real CNS-depressant prescriptions + PT gait
      // notes. No real signals available → no score, no chart write.
      const recentlyPrescribedSedatives = false;
      const hasGaitInstability = false;

      let riskScore = 0;
      if (recentlyPrescribedSedatives) riskScore += 45;
      if (hasGaitInstability) riskScore += 40;

      if (riskScore >= 75) {
        // Recommend a Bed-Alarm protocol for clinician review — never auto-apply.
        recommendations.push({ patientId: patient.id, riskScore });
      }
    }

    return NextResponse.json({
      success: true,
      advisory: true,
      applied: false,
      patientsAnalyzed: geriatricPatients.length,
      highRiskCandidates: recommendations.length,
      recommendations,
    });

  } catch (error) {
    logger.error({ event: "agents.fall_risk_predictor.failed", error });
    return NextResponse.json({ error: "Failed to run fall risk predictor" }, { status: 500 });
  }
}
