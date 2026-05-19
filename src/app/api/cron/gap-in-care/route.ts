import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-138: Population Health Gap-in-Care Closer
// Nightly cron job that scans the active patient panel for HEDIS measure gaps 
// (e.g., overdue mammograms, colonoscopies, diabetic A1C/Eye Exams). 
// Automatically drops bulk lab/imaging orders into the Provider's queue to mass-sign.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "cron.gap_in_care.started" });

    // 1. Fetch active patients (Mock target: Females > 40 for Mammogram)
    const fortyYearsAgo = new Date();
    fortyYearsAgo.setFullYear(fortyYearsAgo.getFullYear() - 40);

    const eligiblePatients = await prisma.patient.findMany({
      where: {
        sexAtBirth: "FEMALE",
        dateOfBirth: { lte: fortyYearsAgo }
      },
      take: 100
    });

    let gapsClosed = 0;

    for (const patient of eligiblePatients) {
      // 2. Evaluate Clinical Guidelines
      // Mock logic: check if patient had a mammogram in the last 2 years
      const needsMammogram = true; 

      if (needsMammogram) {
        // 3. Draft an Order in the Provider's Queue
        logger.info({ 
          event: "cron.gap_in_care.order_drafted", 
          patientId: patient.id, 
          measure: "Breast Cancer Screening" 
        });

        // Add to audit log (acting as order queue in this schema)
        await prisma.auditLog.create({
          data: {
            organizationId: patient.organizationId,
            action: "CLINICAL_ORDER_DRAFTED",
            entity: "Patient",
            entityId: patient.id,
            details: { 
              orderType: "Screening Mammography Bilateral", 
              reason: "HEDIS Gap Closure",
              requiresProviderSignature: true
            }
          }
        });

        gapsClosed++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      patientsScanned: eligiblePatients.length,
      ordersDrafted: gapsClosed
    });

  } catch (error) {
    logger.error({ event: "cron.gap_in_care.failed", error });
    return NextResponse.json({ error: "Failed to run gap in care closer" }, { status: 500 });
  }
}
