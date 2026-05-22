import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-166: Smart Wound Care Assessment AI
// Image ingestion webhook for Home Health or Nursing. When a photo of a patient's wound 
// (e.g., Diabetic Foot Ulcer, Pressure Injury) is uploaded to the chart, this agent 
// uses computer vision to measure surface area, detect necrotic tissue percentage, 
// and log the objective healing progression over time.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.imageUrl) {
      return NextResponse.json({ error: "Missing required wound care fields" }, { status: 400 });
    }

    const { patientId, imageUrl, woundLocation } = payload;

    logger.info({ 
      event: "agents.wound_assessment.image_received", 
      patientId, 
      woundLocation 
    });

    // 1. Mock Computer Vision API Call
    // e.g., POST to AWS Rekognition or specialized clinical model
    const cvAnalysis = {
      surfaceAreaSqCm: 12.5,
      necroticTissuePercentage: 15,
      granulationTissuePercentage: 85,
      suspectedInfection: false
    };

    // 2. Compare against previous measurement (Mock logic)
    const previousAreaSqCm = 15.0;
    const isHealing = cvAnalysis.surfaceAreaSqCm < previousAreaSqCm;

    // 3. Log the objective measurement to the patient's chart
    await prisma.auditLog.create({
      data: {
        organizationId: payload.organizationId || "DEFAULT",
        action: "WOUND_ASSESSMENT_COMPLETED",
        subjectType: "Patient",
        subjectId: patientId,
        metadata: { 
          location: woundLocation, 
          surfaceArea: cvAnalysis.surfaceAreaSqCm, 
          necroticPct: cvAnalysis.necroticTissuePercentage,
          trend: isHealing ? "Improving" : "Worsening"
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      analysis: cvAnalysis,
      trend: isHealing ? "Improving" : "Worsening"
    });

  } catch (error) {
    logger.error({ event: "agents.wound_assessment.failed", error });
    return NextResponse.json({ error: "Failed to run wound assessment AI" }, { status: 500 });
  }
}
