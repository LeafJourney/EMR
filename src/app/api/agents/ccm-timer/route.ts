import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-094: Chronic Care Management (CCM) Timer
// Background agent that tracks non-face-to-face clinical staff time (e.g., chart review, 
// care coordination, phone calls) for complex patients. Automatically generates 
// CPT 99490 draft claims when the 20-minute monthly threshold is breached.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.ccm_timer.started" });

    // 1. Fetch patients enrolled in CCM program
    // Mock logic: patients with 2+ chronic conditions
    const ccmPatients = await prisma.patient.findMany({
      where: { status: "active" }, // Mock condition
      take: 50
    });

    let billingTriggers = 0;

    for (const patient of ccmPatients) {
      // 2. Aggregate staff time spent this month
      // In production, we'd query an audit log or time tracking table
      const totalMinutesSpent = Math.floor(Math.random() * 30); // Random mock value between 0 and 30

      if (totalMinutesSpent >= 20) {
        // 3. Draft a claim for CPT 99490
        await prisma.claim.create({
          data: {
            organizationId: patient.organizationId,
            patientId: patient.id,
            providerId: "CCM_SYSTEM", // System-generated claim
            serviceDate: new Date(),
            status: "draft",
            billedAmountCents: 6500, // $65.00 mock rate for 99490
            cptCodes: [{ code: "99490", description: "Chronic care management services, first 20 min" }],
            icd10Codes: []
          }
        });
        
        logger.info({ 
          event: "agents.ccm_timer.claim_generated", 
          patientId: patient.id, 
          minutes: totalMinutesSpent 
        });
        billingTriggers++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      patientsAnalyzed: ccmPatients.length,
      claimsGenerated: billingTriggers
    });

  } catch (error) {
    logger.error({ event: "agents.ccm_timer.failed", error });
    return NextResponse.json({ error: "Failed to run CCM timer" }, { status: 500 });
  }
}
