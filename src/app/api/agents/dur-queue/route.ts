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

    // ADVISORY ONLY — this agent must NOT change dispense status. The risk
    // signals below are not yet wired to real dose/polypharmacy data; the
    // previous version hardcoded isHighRisk=true and wrote "REQUIRED_REVIEW" /
    // "AUTO_CLEARED" into dispense notes — gating (and auto-clearing) real
    // dispenses on mock logic. It now returns review recommendations for a
    // pharmacist and never mutates a dispense. (EMR-084 follow-up wires scoring.)
    let flaggedCount = 0;
    const recommendations: Array<{ dispenseId: string; reason: string }> = [];

    for (const rx of pendingRx) {
      // TODO(EMR-084): score from rx items (THC mg/day in cannabis-naive
      // patients, >5 active CNS depressants). No real signals → no recommendation.
      const isHighRisk = false;
      const isPolyPharmacy = false;

      if (isHighRisk || isPolyPharmacy) {
        recommendations.push({
          dispenseId: rx.id,
          reason: isPolyPharmacy ? "Polypharmacy" : "High Dose Limit Exceeded",
        });
        flaggedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      advisory: true,
      applied: false,
      prescriptionsAnalyzed: pendingRx.length,
      flaggedForReview: flaggedCount,
      recommendations,
    });

  } catch (error) {
    logger.error({ event: "agents.dur_queue.failed", error });
    return NextResponse.json({ error: "Failed to run DUR queue agent" }, { status: 500 });
  }
}
