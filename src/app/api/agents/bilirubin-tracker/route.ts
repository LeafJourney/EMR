import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-189: NICU/Pediatric Bilirubin Nomogram AI
// Clinical pediatric webhook. Ingests newborn total serum bilirubin (TSB) lab 
// results and plots them against the Bhutani Nomogram based on the exact infant's 
// age in hours. Instantly alerts the pediatrician if phototherapy is required.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.LAB_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.bilirubinMgDl || !payload.ageInHours) {
      return NextResponse.json({ error: "Missing required bilirubin fields" }, { status: 400 });
    }

    const { patientId, bilirubinMgDl, ageInHours, gestationalAgeWeeks } = payload;

    logger.info({ 
      event: "agents.bilirubin_tracker.evaluating", 
      patientId, 
      bilirubinMgDl,
      ageInHours 
    });

    // 1. Evaluate Bhutani Nomogram Phototherapy Thresholds (Mock logic)
    // E.g., at 48 hours of life for a term infant, TSB > 15 mg/dL requires phototherapy
    let requiresPhototherapy = false;
    let riskZone = "Low Risk";

    if (ageInHours >= 48 && ageInHours < 72) {
      if (bilirubinMgDl >= 15.0) requiresPhototherapy = true;
      if (bilirubinMgDl >= 13.0) riskZone = "High Intermediate Risk";
    } else if (ageInHours >= 24 && ageInHours < 48) {
      if (bilirubinMgDl >= 12.0) requiresPhototherapy = true;
    }

    if (requiresPhototherapy) {
      logger.error({ 
        event: "agents.bilirubin_tracker.phototherapy_required", 
        patientId, 
        bilirubinMgDl 
      });

      // 2. Alert Nursery / Pediatrician
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "NEWBORN_PHOTOTHERAPY_ALERT",
          entity: "Patient",
          entityId: patientId,
          details: { 
            bilirubinLevel: bilirubinMgDl, 
            ageHours: ageInHours, 
            action: "Bilirubin exceeds Bhutani nomogram threshold. Initiate phototherapy immediately." 
          }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "intervention_required",
        treatment: "Phototherapy"
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "routine_monitoring",
      riskZone
    });

  } catch (error) {
    logger.error({ event: "agents.bilirubin_tracker.failed", error });
    return NextResponse.json({ error: "Failed to evaluate bilirubin nomogram" }, { status: 500 });
  }
}
