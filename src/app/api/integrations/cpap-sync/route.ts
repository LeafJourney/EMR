import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-124: Smart CPAP Compliance Tracker
// Nightly cron that syncs with cloud-connected CPAP/BiPAP devices (e.g., ResMed AirSense).
// Medicare requires 4+ hours of use per night for 70% of nights to pay for the machine. 
// If the patient falls behind, this agent flags Respiratory Therapy to intervene.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "integrations.cpap_sync.started" });

    // 1. Fetch patients with active CPAP orders
    const cpapPatients = await prisma.patient.findMany({
      where: {
        // Mock tag: "active_dme_cpap"
      },
      take: 50
    });

    let nonCompliantFlagged = 0;

    for (const patient of cpapPatients) {
      // 2. Query external device API (ResMed / Philips)
      // Mock Data: Calculate 30-day usage statistics
      const averageNightlyHours = 3.2; // < 4.0 is non-compliant for Medicare
      const percentageDaysUsed = 55; // < 70% is non-compliant

      if (averageNightlyHours < 4.0 || percentageDaysUsed < 70) {
        // 3. Flag for Respiratory Therapy Intervention
        logger.warn({ 
          event: "integrations.cpap_sync.non_compliance_detected", 
          patientId: patient.id, 
          averageNightlyHours 
        });

        await prisma.auditLog.create({
          data: {
            organizationId: patient.organizationId,
            action: "DME_NON_COMPLIANCE_ALERT",
            entity: "Patient",
            entityId: patient.id,
            details: { 
              device: "CPAP", 
              averageNightlyHours, 
              issue: "Risk of Medicare DME billing clawback. Dispatch RT to assist patient." 
            }
          }
        });

        nonCompliantFlagged++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      scanned: cpapPatients.length,
      nonCompliantFlagged
    });

  } catch (error) {
    logger.error({ event: "integrations.cpap_sync.failed", error });
    return NextResponse.json({ error: "Failed to run CPAP sync" }, { status: 500 });
  }
}
