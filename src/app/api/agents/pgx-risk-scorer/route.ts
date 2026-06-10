import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/log";

// EMR-077: Pharmacogenomics (PGx) Risk Scorer
// AI agent that cross-references a patient's genetic test results (e.g., CYP2C9, CYP3A4 variants)
// against their active medication and proposed cannabis regimen to flag 
// "Poor Metabolizer" or "Ultra-rapid Metabolizer" risks.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.geneticData) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { patientId, geneticData } = payload;
    const flags = [];

    // 1. Mock: Analyze Genetic Variants
    // CYP2C9 is a major pathway for THC metabolism.
    if (geneticData.CYP2C9 === "Poor Metabolizer") {
      flags.push({
        severity: "high",
        pathway: "CYP2C9",
        message: "Patient is a Poor Metabolizer for CYP2C9. Standard doses of THC may lead to 3x higher serum concentrations. Recommend 75% dose reduction and micro-titration."
      });
    }

    // CYP3A4 metabolizes CBD
    if (geneticData.CYP3A4 === "Ultra-rapid Metabolizer") {
      flags.push({
        severity: "medium",
        pathway: "CYP3A4",
        message: "Patient is an Ultra-rapid Metabolizer for CYP3A4. Standard doses of CBD may be ineffective due to rapid clearance. May require higher baseline dosing."
      });
    }

    // ADVISORY ONLY — this agent must NOT write to the chart. The previous
    // version overwrote patient.cannabisHistory wholesale with mock PGx flags
    // (a "75% dose reduction" off hardcoded CYP2C9/3A4 logic), clobbering the
    // real cannabis-history field and presenting unvalidated guidance as fact.
    // Return the flags for clinician review; persist nothing.
    logger.info({
      event: "agents.pgx_scorer.suggested",
      patientId,
      flagsFound: flags.length,
    });

    return NextResponse.json({
      success: true,
      advisory: true,
      applied: false,
      flags,
    });

  } catch (error) {
    logger.error({ event: "agents.pgx_scorer.failed", error });
    return NextResponse.json({ error: "Failed to run PGx risk scorer" }, { status: 500 });
  }
}
