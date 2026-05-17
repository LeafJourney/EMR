import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/log";

// EMR-092: Prescription Drug Monitoring Program (PDMP) Check
// Integration endpoint that queries the state's PDMP database (e.g., PMP AWARxE) 
// before a provider is allowed to sign off on a Schedule II-V medication. 
// Checks for "doctor shopping" or early refill risks.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.PDMP_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.providerNpi || !payload.medicationName) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Mock PDMP API Transaction
    // Simulate network delay to state registry
    await new Promise(resolve => setTimeout(resolve, 600));

    // Mock Result
    // In reality, this would evaluate the patient's NARX score and recent fill history
    const isDoctorShoppingRisk = false; 
    const activePrescriptions = [
      { drug: "Oxycodone", filledAt: "2026-04-15", pharmacy: "CVS #1234", daysSupply: 30 }
    ];

    if (isDoctorShoppingRisk) {
      logger.warn({ 
        event: "integrations.pdmp.high_risk_detected", 
        patientId: payload.patientId, 
        provider: payload.providerNpi 
      });
      
      return NextResponse.json({ 
        success: true, 
        clearance: "denied",
        reason: "High risk of overlapping prescriptions detected in state registry.",
        activePrescriptions
      });
    }

    logger.info({ 
      event: "integrations.pdmp.cleared", 
      patientId: payload.patientId 
    });

    return NextResponse.json({ 
      success: true, 
      clearance: "approved",
      activePrescriptions
    });

  } catch (error) {
    logger.error({ event: "integrations.pdmp.failed", error });
    return NextResponse.json({ error: "Failed to check PDMP database" }, { status: 500 });
  }
}
