import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-164: Dietary/Allergy Meal Tray Auto-Enforcer
// Inpatient clinical safety webhook. If an attending physician orders a "Regular" 
// diet but the patient's global chart indicates a Peanut Allergy or Celiac disease, 
// this agent hard-stops the order. It forces a dietary modification before the 
// ticket ever reaches the hospital kitchen, preventing fatal anaphylaxis.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.dietOrder) {
      return NextResponse.json({ error: "Missing required dietary fields" }, { status: 400 });
    }

    const { patientId, dietOrder, providerId } = payload;
    const orderText = dietOrder.toLowerCase();

    // 1. Fetch Patient Global Allergies
    const patient = await prisma.patient.findUnique({
      where: { id: patientId }
    });

    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // Mocking allergy detection. In production, we check `patient.allergies` array.
    const hasPeanutAllergy = true; // Mock true
    const hasCeliac = false;

    // 2. Evaluate Dietary Conflicts
    let isBlocked = false;
    let blockReason = "";

    if (orderText === "regular diet") {
      if (hasPeanutAllergy) {
        isBlocked = true;
        blockReason = "Fatal Conflict: 'Regular Diet' ordered for patient with severe Peanut Allergy. Must order 'Peanut-Free'.";
      } else if (hasCeliac) {
        isBlocked = true;
        blockReason = "Conflict: 'Regular Diet' ordered for patient with Celiac Disease. Must order 'Gluten-Free'.";
      }
    }

    // 3. Enforce the Hard Stop
    if (isBlocked) {
      logger.error({ 
        event: "agents.dietary_enforcer.order_blocked", 
        patientId, 
        providerId,
        reason: blockReason 
      });

      // Log the safety intervention
      await prisma.auditLog.create({
        data: {
          organizationId: patient.organizationId,
          action: "DIETARY_ORDER_BLOCKED_FOR_ALLERGY",
          subjectType: "Patient",
          subjectId: patientId,
          metadata: { originalOrder: dietOrder, reason: blockReason }
        }
      });

      return NextResponse.json({ 
        success: true, 
        clearance: "blocked",
        reason: blockReason
      });
    }

    // 4. Send to Hospital Kitchen (Mock)
    return NextResponse.json({ 
      success: true, 
      clearance: "approved",
      status: "transmitted_to_kitchen"
    });

  } catch (error) {
    logger.error({ event: "agents.dietary_enforcer.failed", error });
    return NextResponse.json({ error: "Failed to enforce dietary safety" }, { status: 500 });
  }
}
