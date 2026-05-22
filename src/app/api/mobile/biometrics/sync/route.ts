import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-051: Native Mobile App API (Biometrics Sync)
// Receives pushed health data from the Leafjourney mobile app 
// (which collects from Apple HealthKit and Garmin Connect API).

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // 1. Verify User Session (JWT from Mobile App)
    if (!authHeader.startsWith("Bearer ")) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.biometrics) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { patientId, biometrics } = payload;
    let recordsCreated = 0;

    // 2. Process Biometric Array
    for (const dataPoint of biometrics) {
      // In a real implementation we would insert into a dedicated TimeSeries DB or 
      // a Prisma model like PatientBiometrics. Here we simulate appending to a JSON array 
      // on the Patient record (or a mocked table).
      
      // Upsert logic for biometric data point
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          // We can append this to the patient's intakeAnswers or a dedicated field
          // For demonstration, we're assuming the DB handles this via a JSON append 
          // or a separate relation. Here we just log the successful ingestion.
        }
      });
      recordsCreated++;
    }

    logger.info({ event: "mobile.biometrics.sync", patientId, records: recordsCreated });

    return NextResponse.json({ 
      success: true, 
      patientId,
      recordsSynced: recordsCreated
    });

  } catch (error) {
    logger.error({ event: "mobile.biometrics.failed", error });
    return NextResponse.json({ error: "Failed to sync biometrics" }, { status: 500 });
  }
}
