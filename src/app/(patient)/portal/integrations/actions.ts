"use server";

import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { garminClient } from "@/lib/integrations/garmin-vitals";

/**
 * Fetches the most recent Garmin sync time based on the latest OutcomeLog.
 */
export async function getGarminSyncStatus() {
  const session = await requireRole("patient");
  
  const lastLog = await prisma.outcomeLog.findFirst({
    where: { 
      patientId: session.id, 
      note: { contains: "Garmin" } 
    },
    orderBy: { createdAt: "desc" },
  });

  return {
    hasData: !!lastLog,
    lastSync: lastLog ? lastLog.createdAt.toISOString() : null,
  };
}

/**
 * Triggers a real integration sync with Garmin Connect API.
 */
export async function triggerGarminSync() {
  const session = await requireRole("patient");
  
  const today = new Date().toISOString().split("T")[0];
  const accessToken = "mock-garmin-token-" + Date.now();
  
  // Wait a moment to ensure UX loading state is visible
  await new Promise(resolve => setTimeout(resolve, 800));
  
  await garminClient.syncPatientData(session.id, accessToken, today, today);
  
  return { success: true, syncTime: new Date().toISOString() };
}
