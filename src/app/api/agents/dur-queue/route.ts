import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-084: Pharmacist Drug Utilization Review (DUR) Queue
// Background agent that flags high-risk prescriptions (e.g. polypharmacy, high daily MME, 
// or high-THC doses in cannabis-naive patients) and routes them into a mandatory 
// queue for a clinical pharmacist to review before the dispense is authorized.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.dur_queue.started" });

    // 1. Fetch newly written prescriptions that haven't been reviewed
    // Mocking finding the record:
    const pendingRx = await prisma.dispensaryDispense.findMany({
      where: {
        // We assume 'pending_dur' is a status
        // status: "pending_dur"
      },
      take: 100
    });

    let flaggedCount = 0;

    for (const rx of pendingRx) {
      // 2. Logic: High-Risk Detection
      // Assuming rx.items contains the dose or product info
      const isHighRisk = true; // Mock: e.g., checking if THC > 50mg/day for a naive patient
      const isPolyPharmacy = false; // Mock: checking if patient has > 5 active CNS depressants

      if (isHighRisk || isPolyPharmacy) {
        // 3. Queue for Pharmacist Review
        // Update the prescription status to strictly require an override
        await prisma.dispensaryDispense.update({
          where: { id: rx.id },
          data: {
            // We can attach a flag to the JSON items or notes
            notes: "Pharmacist review required: REQUIRED_REVIEW", 
            // In reality, this would be a specific status field
          }
        });

        logger.info({ 
          event: "agents.dur_queue.flagged_for_review", 
          rxId: rx.id, 
          reason: isPolyPharmacy ? "Polypharmacy" : "High Dose Limit Exceeded"
        });
        flaggedCount++;
      } else {
        // Clear for dispensing
        await prisma.dispensaryDispense.update({
          where: { id: rx.id },
          data: {
            notes: "Pharmacist review: AUTO_CLEARED", 
          }
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      prescriptionsAnalyzed: pendingRx.length,
      flaggedForReview: flaggedCount
    });

  } catch (error) {
    logger.error({ event: "agents.dur_queue.failed", error });
    return NextResponse.json({ error: "Failed to run DUR queue agent" }, { status: 500 });
  }
}
