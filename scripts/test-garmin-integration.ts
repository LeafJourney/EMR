import { mockGarminPayload } from "../src/lib/integrations/garmin/client";
import { ingestGarminPayload } from "../src/lib/integrations/garmin-vitals";
import { prisma } from "../src/lib/db/prisma";

// Local smoke test for the Garmin -> OutcomeLog mapping. Uses the SIMULATED
// payload (everything written is tagged "(SIMULATED)"); it does not contact
// Garmin. For the live flow, connect a patient via the portal.
async function main() {
  console.log("🚀 Testing Garmin Vitals Ingestion (simulated, local script)");
  const today = new Date().toISOString().split("T")[0];

  try {
    const patient = await prisma.patient.findFirst();
    if (!patient) {
      throw new Error("No patients found in the database. Please run seed script first.");
    }

    console.log(
      `✅ Patient ensured: ${patient.firstName} ${patient.lastName} (${patient.id})`,
    );

    console.log(`⏳ Ingesting simulated payload for ${today}...`);
    const written = await ingestGarminPayload(
      patient.id,
      mockGarminPayload(today, today),
      { simulated: true },
    );
    console.log(`   wrote ${written} OutcomeLogs`);

    const logs = await prisma.outcomeLog.findMany({
      where: { patientId: patient.id },
      orderBy: { loggedAt: "desc" },
      take: 3,
    });

    console.log("\n📊 Most recent OutcomeLogs:");
    logs.forEach((log) => {
      console.log(`  - ${log.metric}: ${log.value}/10 (Note: ${log.note})`);
    });

    console.log("\n✅ Done. Simulated biometric data mapped into OutcomeLog.");
  } catch (err) {
    console.error("❌ Failed to test Garmin integration:", err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
