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

    let highRiskFlagged = 0;

    for (const patient of geriatricPatients) {
      // 2. ML Risk Scoring Mock
      // Analyze recent prescriptions for Benzodiazepines, Z-drugs, or Opioids
      const recentlyPrescribedSedatives = true; // Mocked condition
      // Analyze PT notes for "gait instability"
      const hasGaitInstability = true; // Mocked condition

      let riskScore = 0;
      if (recentlyPrescribedSedatives) riskScore += 45;
      if (hasGaitInstability) riskScore += 40;

      if (riskScore >= 75) {
        // 3. Trigger Fall Risk Protocol
        logger.warn({ 
          event: "agents.fall_risk_predictor.high_risk_detected", 
          patientId: patient.id, 
          riskScore 
        });

        // Add a permanent clinical alert to the patient chart
        await prisma.patient.update({
          where: { id: patient.id },
          data: {
            // Appending a mock clinical flag
            presentingConcerns: patient.presentingConcerns ? `${patient.presentingConcerns}, HIGH FALL RISK` : "HIGH FALL RISK"
          }
        });

        // Fire alert to nursing station for Bed Alarm placement
        await prisma.auditLog.create({
          data: {
            organizationId: patient.organizationId,
            action: "FALL_PREVENTION_PROTOCOL_ACTIVATED",
            entity: "Patient",
            entityId: patient.id,
            details: { riskScore, requiredAction: "Place Bed Alarm" }
          }
        });

        highRiskFlagged++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      patientsAnalyzed: geriatricPatients.length,
      highRiskFlagged
    });

  } catch (error) {
    logger.error({ event: "agents.fall_risk_predictor.failed", error });
    return NextResponse.json({ error: "Failed to run fall risk predictor" }, { status: 500 });
  }
}
