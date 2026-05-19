import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-182: Pharmacy Auto-Substitution (Formulary)
// Inpatient pharmacy webhook. When a hospitalist orders an expensive, non-formulary 
// medication, this agent intercepts it and automatically substitutes the hospital's 
// P&T-approved formulary equivalent (e.g., Pantoprazole IV instead of Omeprazole IV), 
// saving the facility thousands per day.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.medicationOrder || !payload.patientId) {
      return NextResponse.json({ error: "Missing required order fields" }, { status: 400 });
    }

    const { medicationOrder, patientId } = payload;
    const orderText = medicationOrder.toLowerCase();

    logger.info({ 
      event: "agents.formulary_substitutor.evaluating", 
      patientId,
      order: medicationOrder 
    });

    // 1. Mock P&T (Pharmacy & Therapeutics) Formulary Rules
    let substitutionMade = false;
    let substitutedDrug = "";

    // Example Rule: Switch Omeprazole IV to Pantoprazole IV
    if (orderText.includes("omeprazole iv")) {
      substitutionMade = true;
      substitutedDrug = "Pantoprazole 40mg IV";
    }

    if (substitutionMade) {
      logger.info({ 
        event: "agents.formulary_substitutor.auto_substituted", 
        original: medicationOrder,
        substituted: substitutedDrug 
      });

      // 2. Commit Substitution and Notify Provider
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "INPATIENT_FORMULARY_SUBSTITUTION",
          entity: "Patient", // Should be MedicationOrder in full schema
          entityId: patientId,
          details: { original: medicationOrder, substituted: substitutedDrug, reason: "P&T Committee Therapeutic Interchange Protocol" }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "substituted",
        newOrder: substitutedDrug
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "approved_as_ordered"
    });

  } catch (error) {
    logger.error({ event: "agents.formulary_substitutor.failed", error });
    return NextResponse.json({ error: "Failed to process formulary substitution" }, { status: 500 });
  }
}
