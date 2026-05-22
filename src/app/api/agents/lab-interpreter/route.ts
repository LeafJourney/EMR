import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-141: Lab Results Auto-Interpreter (Patient Portal)
// Agent that intercepts incoming HL7 ORU lab results. It uses an LLM to translate 
// complex clinical jargon (e.g., CBC, CMP, Lipid Panels) into an 8th-grade reading 
// level summary before publishing to the patient portal. This drastically reduces 
// confused "What does this mean?" inbox messages to providers.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.LAB_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.labId || !payload.results) {
      return NextResponse.json({ error: "Missing required lab fields" }, { status: 400 });
    }

    const { patientId, labId, results } = payload;

    logger.info({ 
      event: "agents.lab_interpreter.processing", 
      patientId, 
      labId 
    });

    // 1. Mock LLM Translation Logic
    // In production, we'd pass `results` (e.g., "LDL-C 145 mg/dL") to an LLM
    let translatedSummary = "";

    if (JSON.stringify(results).toLowerCase().includes("ldl")) {
      translatedSummary = "Your recent blood test checked your cholesterol. Your 'LDL' (the bad cholesterol) is slightly high. Your doctor may recommend diet changes or medication to help lower it.";
    } else {
      translatedSummary = "Your lab results are back and have been reviewed by your doctor. The results look stable.";
    }

    // 2. Publish to Patient Portal via Audit Log / Message Queue
    await prisma.auditLog.create({
      data: {
        organizationId: payload.organizationId || "DEFAULT",
        action: "PATIENT_PORTAL_LAB_SUMMARY_PUBLISHED",
        subjectType: "LabResult",
        subjectId: labId,
        metadata: { patientId, summary: translatedSummary }
      }
    });

    logger.info({ 
      event: "agents.lab_interpreter.published", 
      patientId, 
      labId 
    });

    return NextResponse.json({ 
      success: true, 
      status: "summary_published",
      translation: translatedSummary
    });

  } catch (error) {
    logger.error({ event: "agents.lab_interpreter.failed", error });
    return NextResponse.json({ error: "Failed to interpret lab results" }, { status: 500 });
  }
}
