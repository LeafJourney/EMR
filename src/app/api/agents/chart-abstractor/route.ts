import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-172: Automated Chart Abstraction Agent
// Ingestion webhook. When a massive 50-page PDF fax arrives from an external 
// hospital (Continuity of Care Document), this AI uses OCR and NLP to extract 
// active medications, new allergies, and diagnosed problems. It parses them directly 
// into discrete EMR fields, saving medical assistants hours of manual data entry.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.documentId || !payload.patientId || !payload.extractedText) {
      return NextResponse.json({ error: "Missing required abstraction fields" }, { status: 400 });
    }

    const { patientId, documentId, extractedText } = payload;

    logger.info({ 
      event: "agents.chart_abstractor.started", 
      patientId, 
      documentId 
    });

    // 1. Mock NLP Entity Extraction
    // In production, pass `extractedText` to a medical LLM
    const text = extractedText.toLowerCase();
    
    const extractedData = {
      newAllergies: [] as string[],
      newMedications: [] as string[],
      newDiagnoses: [] as string[]
    };

    if (text.includes("allergic to penicillin")) extractedData.newAllergies.push("Penicillin");
    if (text.includes("lisinopril 20mg daily")) extractedData.newMedications.push("Lisinopril 20mg");
    if (text.includes("type 2 diabetes mellitus")) extractedData.newDiagnoses.push("Type 2 Diabetes");

    // 2. Draft the Clinical Updates (Requires Provider Review to commit)
    const elementsFound = extractedData.newAllergies.length + extractedData.newMedications.length + extractedData.newDiagnoses.length;

    if (elementsFound > 0) {
      logger.info({ 
        event: "agents.chart_abstractor.data_extracted", 
        patientId, 
        elementsFound 
      });

      // Queue for reconciliation
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "CHART_ABSTRACTION_RECONCILIATION_QUEUED",
          subjectType: "Patient",
          subjectId: patientId,
          metadata: { documentId, extractedData, status: "Pending Provider Approval" }
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "abstraction_complete",
      elementsFound,
      extractedData
    });

  } catch (error) {
    logger.error({ event: "agents.chart_abstractor.failed", error });
    return NextResponse.json({ error: "Failed to run chart abstraction" }, { status: 500 });
  }
}
