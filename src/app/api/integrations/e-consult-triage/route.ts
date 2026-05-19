import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-126: E-Consult Triage Engine (Asynchronous)
// Handles inbound curbside E-Consults from Primary Care. Uses NLP to gauge clinical 
// complexity. Simple medication questions route to Advanced Practice Providers (NPs/PAs), 
// while complex surgical/diagnostic questions route to the Attending Physician.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.referringProvider || !payload.clinicalQuestion) {
      return NextResponse.json({ error: "Missing required e-consult fields" }, { status: 400 });
    }

    const { clinicalQuestion, patientId } = payload;
    const text = clinicalQuestion.toLowerCase();

    // 1. NLP Complexity Triage
    let routedTo = "Mid-Level Provider (NP/PA)";
    let isComplex = false;

    if (
      text.includes("surgery") || 
      text.includes("refractory") || 
      text.includes("undiagnosed") || 
      text.includes("malignancy")
    ) {
      routedTo = "Attending Physician / Specialist";
      isComplex = true;
    }

    logger.info({ 
      event: "integrations.e_consult_triage.routed", 
      patientId, 
      routedTo,
      isComplex
    });

    // 2. Queue the E-Consult
    await prisma.auditLog.create({
      data: {
        organizationId: payload.organizationId || "DEFAULT",
        action: "E_CONSULT_RECEIVED",
        entity: "Patient",
        entityId: patientId,
        details: { complexity: isComplex ? "High" : "Low", assignedTo: routedTo }
      }
    });

    return NextResponse.json({ 
      success: true, 
      routingDecision: routedTo,
      isComplex
    });

  } catch (error) {
    logger.error({ event: "integrations.e_consult_triage.failed", error });
    return NextResponse.json({ error: "Failed to triage E-Consult" }, { status: 500 });
  }
}
