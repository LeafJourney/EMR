import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-055: Clinical Decision Support (CDS) Alerts
// AI-assisted agent that reviews a patient's active medication list, 
// allergies, and proposed new prescriptions to flag drug-drug interactions 
// (DDI) and contraindications.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }


    const payload = await req.json();

    if (!payload.patientId || !payload.proposedMedication) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Fetch Patient Clinical Profile
    const patient = await prisma.patient.findUnique({
      where: { id: payload.patientId },
      select: {
        allergies: true,
        contraindications: true,
        cannabisHistory: true
      }
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const alerts: Array<{ severity: "high" | "medium" | "low", message: string }> = [];

    // Mocking the CDS Logic (In reality, this would hit an external database like First Databank or Medispan)
    const proposedMed = payload.proposedMedication.toLowerCase();
    
    // Check 1: Direct Allergies
    if (patient.allergies.some(a => proposedMed.includes(a.toLowerCase()))) {
      alerts.push({
        severity: "high",
        message: `Patient has a documented allergy to ${payload.proposedMedication}.`
      });
    }

    // Check 2: Cannabis/Contraindication interactions
    if (proposedMed.includes("warfarin") || proposedMed.includes("blood thinner")) {
      alerts.push({
        severity: "high",
        message: `High risk interaction: Cannabinoids may increase serum concentrations of ${payload.proposedMedication} (CYP2C9 competitive inhibition). Monitor INR closely.`
      });
    } else if (proposedMed.includes("ssri") || proposedMed.includes("sertraline")) {
      alerts.push({
        severity: "medium",
        message: "Moderate interaction: Potential for increased CNS depression when combined with high-THC therapies."
      });
    }

    logger.info({ 
      event: "agents.cds.evaluation", 
      patientId: payload.patientId, 
      alertsCount: alerts.length 
    });

    return NextResponse.json({ 
      success: true, 
      alerts 
    });

  } catch (error) {
    logger.error({ event: "agents.cds.failed", error });
    return NextResponse.json({ error: "Failed to run clinical decision support checks" }, { status: 500 });
  }
}
