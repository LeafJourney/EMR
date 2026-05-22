import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
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

    // 2. Alert Provider Context
    if (flags.length > 0) {
      // Append these permanent PGx warnings to the patient's briefing context or clinical warnings
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          // We assume a `pgxWarnings` JSON column or appending to `presentingConcerns`
          cannabisHistory: { pgxFlags: flags }
        }
      });
    }

    logger.info({ 
      event: "agents.pgx_scorer.completed", 
      patientId, 
      flagsFound: flags.length 
    });

    return NextResponse.json({ 
      success: true, 
      flags
    });

  } catch (error) {
    logger.error({ event: "agents.pgx_scorer.failed", error });
    return NextResponse.json({ error: "Failed to run PGx risk scorer" }, { status: 500 });
  }
}
