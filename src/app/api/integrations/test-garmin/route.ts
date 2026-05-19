import { NextResponse } from "next/server";
import { garminClient } from "@/lib/integrations/garmin-vitals";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    // 1. Get an existing patient to attach the data to
    const patient = await prisma.patient.findFirst();
    if (!patient) {
      return NextResponse.json(
        { error: "No patients found in the database to test against. Please seed." },
        { status: 400 }
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const accessToken = "mock-garmin-token-staging";

    // 2. Trigger the Garmin sync
    await garminClient.syncPatientData(patient.id, accessToken, today, today);

    // 3. Verify the records were created
    const logs = await prisma.outcomeLog.findMany({
      where: { patientId: patient.id },
      orderBy: { loggedAt: "desc" },
      take: 3,
    });

    return NextResponse.json({
      success: true,
      message: `Garmin Vitals successfully ingested for patient ${patient.id}`,
      logs: logs.map(l => ({
        metric: l.metric,
        value: l.value,
        note: l.note,
      })),
    });
  } catch (error) {
    console.error("Failed to test Garmin integration on staging:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
