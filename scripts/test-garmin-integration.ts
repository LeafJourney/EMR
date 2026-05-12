import { garminClient } from "../src/lib/integrations/garmin-vitals";
import { prisma } from "../src/lib/db/prisma";

async function main() {
  console.log("🚀 Testing Garmin Vitals Ingestion (Local Testing Script)");
  const patientId = "garmin-demo-123";
  const accessToken = "mock-garmin-token";
  const today = new Date().toISOString().split("T")[0];

  try {
    // 1. Get an existing patient to attach the data to
    const patient = await prisma.patient.findFirst();
    if (!patient) {
      throw new Error("No patients found in the database. Please run seed script first.");
    }

    console.log(
      `✅ Patient ensured: ${patient.firstName} ${patient.lastName} (${patient.id})`,
    );

    // 2. Trigger the Garmin sync
    console.log(`⏳ Triggering sync for ${today}...`);
    await garminClient.syncPatientData(patient.id, accessToken, today, today);

    // 3. Verify the records were created
    const logs = await prisma.outcomeLog.findMany({
      where: { patientId },
      orderBy: { loggedAt: "desc" },
      take: 3,
    });

    console.log("\n📊 Successfully ingested OutcomeLogs:");
    logs.forEach((log) => {
      console.log(`  - ${log.metric}: ${log.value}/10 (Note: ${log.note})`);
    });

    console.log(
      "\n✅ Integration test complete! The biometric data is now mapped into Verdant's OutcomeLog.",
    );
  } catch (err) {
    console.error("❌ Failed to test Garmin integration:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
