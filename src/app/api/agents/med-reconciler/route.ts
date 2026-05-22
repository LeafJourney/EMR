import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-191: AI Smart-Discharge Medication Reconciler
// Inpatient clinical safety agent. At hospital discharge, this agent compares 
// the patient's inpatient active med list against their pre-admission home meds. 
// It uses NLP to flag therapeutic duplications (e.g., stopping IV Heparin and 
// starting PO Eliquis) and drafts the final clean eRx list for the Attending.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.patientId) {
      return NextResponse.json({ error: "Missing required discharge fields" }, { status: 400 });
    }

    const { encounterId, patientId, inpatientMeds, homeMeds } = payload;

    logger.info({ 
      event: "agents.med_reconciler.started", 
      encounterId, 
      patientId 
    });

    // 1. Mock Med Rec NLP Logic
    // In production, an LLM compares `inpatientMeds` against `homeMeds`
    const recommendations = [];
    const duplications = [];

    // Simulate finding a transition from IV to PO anticoagulants
    const hasIvHeparin = inpatientMeds?.some((m: string) => m.toLowerCase().includes("heparin"));
    const hasHomeEliquis = homeMeds?.some((m: string) => m.toLowerCase().includes("eliquis") || m.toLowerCase().includes("apixaban"));

    if (hasIvHeparin && hasHomeEliquis) {
      duplications.push("Anticoagulant Duplication Risk");
      recommendations.push("Discontinue inpatient IV Heparin. Resume home PO Eliquis 5mg BID.");
    }

    // 2. Draft Final Med List for Provider Review
    await prisma.auditLog.create({
      data: {
        organizationId: payload.organizationId || "DEFAULT",
        action: "DISCHARGE_MED_RECONCILIATION_DRAFTED",
        subjectType: "Encounter",
        subjectId: encounterId,
        metadata: { 
          duplicationsFlagged: duplications, 
          recommendations,
          status: "Pending Attending Signature"
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      status: "reconciliation_drafted",
      flags: duplications.length,
      recommendations
    });

  } catch (error) {
    logger.error({ event: "agents.med_reconciler.failed", error });
    return NextResponse.json({ error: "Failed to run med reconciliation AI" }, { status: 500 });
  }
}
