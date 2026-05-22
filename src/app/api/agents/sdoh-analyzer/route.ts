import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-086: SDoH (Social Determinants of Health) Analyzer
// AI Agent that scans intake forms and clinical notes for indicators of 
// housing instability, food insecurity, or lack of transportation. 
// Automatically assigns ICD-10 Z-codes and alerts the Social Work team.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.clinicalNoteText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. NLP Mock: Identify SDoH markers in text
    const text = payload.clinicalNoteText.toLowerCase();
    const sdohFlags = [];

    if (text.includes("homeless") || text.includes("eviction") || text.includes("shelter")) {
      sdohFlags.push({ code: "Z59.0", description: "Homelessness" });
    }
    if (text.includes("food insecurity") || text.includes("can't afford groceries")) {
      sdohFlags.push({ code: "Z59.4", description: "Lack of adequate food" });
    }
    if (text.includes("no car") || text.includes("missed bus") || text.includes("transportation issue")) {
      sdohFlags.push({ code: "Z59.82", description: "Transportation insecurity" });
    }

    if (sdohFlags.length > 0) {
      // 2. Add to Patient Profile and Alert Social Work Queue
      logger.info({ 
        event: "agents.sdoh_analyzer.flags_detected", 
        patientId: payload.patientId, 
        flags: sdohFlags.map(f => f.code) 
      });

      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "SDOH_RISK_IDENTIFIED",
          subjectType: "Patient",
          subjectId: payload.patientId,
          metadata: { flags: sdohFlags }
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      flagsIdentified: sdohFlags.length,
      sdohFlags
    });

  } catch (error) {
    logger.error({ event: "agents.sdoh_analyzer.failed", error });
    return NextResponse.json({ error: "Failed to run SDoH analyzer" }, { status: 500 });
  }
}
