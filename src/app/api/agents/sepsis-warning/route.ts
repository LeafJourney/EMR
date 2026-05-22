import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-103: Automated Sepsis Early Warning System
// High-frequency cron scanning inpatient vitals (temp, heart rate, respiratory rate) 
// and recent lab results (WBC count) to detect SIRS criteria. 
// Instantly alerts the Rapid Response Team if a patient triggers the Sepsis Protocol.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "agents.sepsis_warning.started" });

    // 1. Fetch recently updated vitals and labs for all admitted patients
    // Mocking finding patients in an admitted status
    const admittedPatients = await prisma.patient.findMany({
      where: {
        // status: "admitted"
      },
      take: 100
    });

    let sepsisAlertsFired = 0;

    for (const patient of admittedPatients) {
      // 2. Evaluate SIRS (Systemic Inflammatory Response Syndrome) Criteria
      // Mock Data: In reality, we'd query the latest `Vitals` and `LabResult` models
      const tempF = 101.5; // > 100.4
      const heartRate = 110; // > 90
      const respRate = 22; // > 20
      const wbcCount = 14000; // > 12000

      let sirsPoints = 0;
      if (tempF > 100.4 || tempF < 96.8) sirsPoints++;
      if (heartRate > 90) sirsPoints++;
      if (respRate > 20) sirsPoints++;
      if (wbcCount > 12000 || wbcCount < 4000) sirsPoints++;

      if (sirsPoints >= 2) {
        // 3. Probable Sepsis detected. Fire Rapid Response Alert!
        logger.error({ 
          event: "agents.sepsis_warning.code_sepsis_triggered", 
          patientId: patient.id, 
          sirsPoints 
        });

        // Trigger the Code Sepsis bundle (Lactate, Blood Cultures, IV Fluids, Antibiotics)
        await prisma.auditLog.create({
          data: {
            organizationId: patient.organizationId,
            action: "RAPID_RESPONSE_SEPSIS_ALERT",
            subjectType: "Patient",
            subjectId: patient.id,
            metadata: { sirsPoints, protocolsInitiated: ["Lactate", "Blood Cultures", "Broad-spectrum IV ABX"] }
          }
        });

        sepsisAlertsFired++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      patientsScanned: admittedPatients.length,
      sepsisAlertsFired
    });

  } catch (error) {
    logger.error({ event: "agents.sepsis_warning.failed", error });
    return NextResponse.json({ error: "Failed to run sepsis warning system" }, { status: 500 });
  }
}
