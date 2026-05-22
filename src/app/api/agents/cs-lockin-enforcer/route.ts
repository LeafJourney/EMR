import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-186: Controlled Substance Lock-In Program Enforcer
// Compliance agent. Scans state Medicaid "Lock-In" lists. It prevents the 
// prescribing of narcotics to patients who are legally restricted to a single 
// designated pharmacy and provider to combat doctor shopping and opioid abuse.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.providerId || !payload.medicationClass) {
      return NextResponse.json({ error: "Missing required prescribing fields" }, { status: 400 });
    }

    const { patientId, providerId, medicationClass, pharmacyNCPDP } = payload;

    // Only run if a Controlled Substance is being prescribed
    if (medicationClass !== "controlled_substance") {
      return NextResponse.json({ success: true, status: "not_applicable" });
    }

    logger.info({ 
      event: "agents.cs_lockin_enforcer.evaluating", 
      patientId 
    });

    // 1. Check Medicaid Lock-In Status (Mock)
    const patientLockInStatus = {
      isLockedIn: true,
      designatedProviderId: "PROVIDER-999",
      designatedPharmacyNCPDP: "PHARM-123"
    };

    if (patientLockInStatus.isLockedIn) {
      // 2. Enforce Lock-In Rules
      const isWrongProvider = providerId !== patientLockInStatus.designatedProviderId;
      const isWrongPharmacy = pharmacyNCPDP !== patientLockInStatus.designatedPharmacyNCPDP;

      if (isWrongProvider || isWrongPharmacy) {
        logger.error({ 
          event: "agents.cs_lockin_enforcer.violation_blocked", 
          patientId, 
          providerId,
          pharmacyNCPDP
        });

        // 3. Hard Stop the eRx
        const reason = `Medicaid Lock-In Violation: Patient is restricted to Provider ${patientLockInStatus.designatedProviderId} and Pharmacy ${patientLockInStatus.designatedPharmacyNCPDP}. Prescription blocked.`;
        
        await prisma.auditLog.create({
          data: {
            organizationId: payload.organizationId || "DEFAULT",
            action: "CS_LOCKIN_PRESCRIPTION_BLOCKED",
            subjectType: "Patient",
            subjectId: patientId,
            metadata: { reason, providerId, pharmacyNCPDP }
          }
        });

        return NextResponse.json({ 
          success: true, 
          clearance: "blocked",
          reason
        });
      }
    }

    return NextResponse.json({ 
      success: true, 
      clearance: "approved"
    });

  } catch (error) {
    logger.error({ event: "agents.cs_lockin_enforcer.failed", error });
    return NextResponse.json({ error: "Failed to enforce lock-in program" }, { status: 500 });
  }
}
