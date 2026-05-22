import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-170: Opioid Risk Tool (ORT) NLP Scorer
// Clinical safety agent. Before a provider prescribes Schedule II narcotics, 
// this NLP agent scans the longitudinal chart for psychiatric history, prior 
// substance abuse, and age parameters. It auto-calculates an Opioid Risk Score 
// to warn the provider of potential addiction risk.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.medicationClass) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { patientId, medicationClass } = payload;

    // Only run if an Opioid/Narcotic is being prescribed
    if (medicationClass !== "opioid") {
      return NextResponse.json({ success: true, status: "not_applicable" });
    }

    logger.info({ 
      event: "agents.opioid_risk_scorer.evaluating", 
      patientId 
    });

    // 1. Fetch Patient Chart Context
    const patient = await prisma.patient.findUnique({
      where: { id: patientId }
    });

    if (!patient) return NextResponse.json({ error: "Patient not found" }, { status: 404 });

    // 2. Mock NLP Extraction for ORT Criteria
    // In production, an LLM scans past encounters and problem list
    const historyOfSubstanceAbuse = true; // High risk trigger
    const historyOfDepression = true;

    let riskScore = 0;
    if (historyOfSubstanceAbuse) riskScore += 5;
    if (historyOfDepression) riskScore += 1;

    let riskLevel = "Low Risk";
    if (riskScore >= 4) riskLevel = "High Risk";
    else if (riskScore === 3) riskLevel = "Moderate Risk";

    // 3. Inject Warning into eRx Workflow
    if (riskLevel === "High Risk") {
      logger.warn({ 
        event: "agents.opioid_risk_scorer.high_risk_detected", 
        patientId, 
        score: riskScore 
      });

      await prisma.auditLog.create({
        data: {
          organizationId: patient.organizationId,
          action: "OPIOID_HIGH_RISK_WARNING_DISPLAYED",
          subjectType: "Patient",
          subjectId: patientId,
          metadata: { score: riskScore, riskLevel, factors: ["Substance Abuse Hx", "Depression"] }
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      score: riskScore,
      riskLevel
    });

  } catch (error) {
    logger.error({ event: "agents.opioid_risk_scorer.failed", error });
    return NextResponse.json({ error: "Failed to score opioid risk" }, { status: 500 });
  }
}
