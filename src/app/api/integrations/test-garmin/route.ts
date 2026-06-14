// Garmin ingestion smoke-test (debug only).
//
// This endpoint writes biometric OutcomeLogs to a real patient, so it is
// gated HARD behind mock mode: it does nothing unless resolveGarminMode()
// === "mock" (an explicit, non-production opt-in). In production or live mode
// it 404s, so it can never fabricate data on a real chart.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { resolveGarminMode } from "@/lib/integrations/garmin/config";
import { mockGarminPayload } from "@/lib/integrations/garmin/client";
import { ingestGarminPayload } from "@/lib/integrations/garmin-vitals";

export async function GET() {
  if (resolveGarminMode() !== "mock") {
    // Not found unless the simulated demo mode is explicitly enabled.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const patient = await prisma.patient.findFirst();
    if (!patient) {
      return NextResponse.json(
        { error: "No patients found in the database to test against. Please seed." },
        { status: 400 },
      );
    }

    const today = new Date().toISOString().split("T")[0];
    const written = await ingestGarminPayload(
      patient.id,
      mockGarminPayload(today, today),
      { simulated: true },
    );

    const logs = await prisma.outcomeLog.findMany({
      where: { patientId: patient.id },
      orderBy: { loggedAt: "desc" },
      take: 3,
    });

    return NextResponse.json({
      success: true,
      mode: "mock",
      message: `Simulated Garmin Vitals ingested for patient ${patient.id} (${written} logs)`,
      logs: logs.map((l) => ({ metric: l.metric, value: l.value, note: l.note })),
    });
  } catch (error) {
    console.error("Failed to run Garmin mock ingestion:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
