import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    
    // Process "dailies" (Body Battery, Stress, etc.)
    if (payload.dailies && Array.isArray(payload.dailies)) {
      for (const daily of payload.dailies) {
        if (!daily.userAccessToken) continue;
        
        // Find the patient via the IntegrationConnection
        const connection = await prisma.integrationConnection.findFirst({
          where: { provider: "garmin", accessToken: daily.userAccessToken }
        });
        
        if (!connection) continue;

        const logsToCreate = [];

        if (daily.bodyBatteryHighestValue) {
          logsToCreate.push({
            patientId: connection.patientId,
            metric: "energy" as const,
            value: daily.bodyBatteryHighestValue / 10,
            note: `Garmin Body Battery (Peak: ${daily.bodyBatteryHighestValue}, Low: ${daily.bodyBatteryLowestValue})`,
            loggedAt: new Date(daily.calendarDate),
          });
        }

        if (daily.averageStressLevel) {
          logsToCreate.push({
            patientId: connection.patientId,
            metric: "anxiety" as const,
            value: daily.averageStressLevel / 10,
            note: `Garmin Average Stress Level: ${daily.averageStressLevel} (Max: ${daily.maxStressLevel})`,
            loggedAt: new Date(daily.calendarDate),
          });
        }

        if (logsToCreate.length > 0) {
          await prisma.outcomeLog.createMany({ data: logsToCreate });
          await prisma.integrationConnection.update({
            where: { id: connection.id },
            data: { lastSyncAt: new Date() }
          });
        }
      }
    }

    // Process "sleeps"
    if (payload.sleeps && Array.isArray(payload.sleeps)) {
      for (const sleep of payload.sleeps) {
        if (!sleep.userAccessToken) continue;
        
        const connection = await prisma.integrationConnection.findFirst({
          where: { provider: "garmin", accessToken: sleep.userAccessToken }
        });
        
        if (!connection) continue;

        if (sleep.sleepScore) {
          await prisma.outcomeLog.create({
            data: {
              patientId: connection.patientId,
              metric: "sleep" as const,
              value: sleep.sleepScore / 10,
              note: `Garmin Sleep Score: ${sleep.sleepScore} (${(sleep.durationInSeconds / 3600).toFixed(1)} hrs)`,
              loggedAt: new Date(sleep.calendarDate),
            }
          });
          await prisma.integrationConnection.update({
            where: { id: connection.id },
            data: { lastSyncAt: new Date() }
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Garmin Webhook Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
