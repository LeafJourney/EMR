import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-117: Controlled Substance Agreement Auto-Locker
// Security agent that intercepts the e-prescribing flow for Schedule II-V medications.
// If the patient's Pain Management Agreement or annual Urine Drug Screen (UDS) 
// is expired, it blocks the provider from signing the script and flags the chart.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.providerId || !payload.medicationClass) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Only run this check for Controlled Substances
    const isControlled = ["Schedule II", "Schedule III", "Schedule IV", "Schedule V"].includes(payload.medicationClass);
    
    if (!isControlled) {
      return NextResponse.json({ success: true, clearance: "approved" });
    }

    // 1. Fetch compliance records
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const patient = await prisma.patient.findUnique({
      where: { id: payload.patientId },
      // Mocking relations for Pain Contract and UDS
      // include: { documents: true, labResults: true }
    });

    // 2. Evaluate Compliance (Mock Logic)
    const hasActivePainContract = false; // Simulated missing contract
    const hasRecentUDS = true;

    if (!hasActivePainContract || !hasRecentUDS) {
      const blockReason = !hasActivePainContract ? "Pain Management Agreement Expired" : "Annual Urine Drug Screen Overdue";

      logger.warn({ 
        event: "agents.cs_locker.prescription_blocked", 
        patientId: payload.patientId, 
        reason: blockReason 
      });

      // Log the hard stop
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "CONTROLLED_SUBSTANCE_RX_BLOCKED",
          subjectType: "Patient",
          subjectId: payload.patientId,
          metadata: { providerId: payload.providerId, reason: blockReason }
        }
      });

      return NextResponse.json({ 
        success: true, 
        clearance: "blocked",
        reason: blockReason
      });
    }

    return NextResponse.json({ 
      success: true, 
      clearance: "approved"
    });

  } catch (error) {
    logger.error({ event: "agents.cs_locker.failed", error });
    return NextResponse.json({ error: "Failed to run CS locker checks" }, { status: 500 });
  }
}
