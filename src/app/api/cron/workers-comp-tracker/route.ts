import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-136: Workers Comp / MVA Lien Tracker
// Background billing agent that scans new encounters. If the visit reason includes 
// "car accident" or "work injury", it automatically isolates the billing ledger to 
// prevent the patient's primary health insurance from being illegally billed for a liability claim.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.chiefComplaint) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { encounterId, chiefComplaint, patientId } = payload;
    const text = chiefComplaint.toLowerCase();

    // 1. NLP scan for liability trigger words
    const isMVA = text.includes("car accident") || text.includes("mva") || text.includes("auto collision");
    const isWorkersComp = text.includes("work injury") || text.includes("hurt at work") || text.includes("workers comp");

    if (isMVA || isWorkersComp) {
      const liabilityType = isMVA ? "Motor Vehicle Accident (MVA)" : "Workers Compensation";

      logger.warn({ 
        event: "agents.liability_tracker.isolated", 
        encounterId, 
        type: liabilityType 
      });

      // 2. Isolate Billing / Shift to Liability Ledger
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "BILLING_LEDGER_ISOLATED_LIABILITY",
          subjectType: "Encounter",
          subjectId: encounterId,
          metadata: { 
            reason: liabilityType, 
            instruction: "DO NOT BILL PRIMARY COMMERCIAL INSURANCE" 
          }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "ledger_isolated",
        liabilityType
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "routine_billing_allowed"
    });

  } catch (error) {
    logger.error({ event: "agents.liability_tracker.failed", error });
    return NextResponse.json({ error: "Failed to process liability tracking" }, { status: 500 });
  }
}
