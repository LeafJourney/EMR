/**
 * Garmin Vitals Ingestion (EMR-054)
 *
 * API client to parse biometric data from the Garmin Connect Health API.
 * Maps Garmin's unique Body Battery, Stress Level, and Sleep metrics
 * into Verdant's OutcomeLog schema.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

export interface GarminDailySummary {
  calendarDate: string; // YYYY-MM-DD
  averageHeartRateInBeatsPerMinute: number;
  averageStressLevel: number; // 0-100
  maxStressLevel: number;
  bodyBatteryLowestValue: number; // 0-100
  bodyBatteryHighestValue: number; // 0-100
}

export interface GarminSleepSummary {
  calendarDate: string;
  durationInSeconds: number;
  sleepScore: number; // 0-100
}

export interface GarminPayload {
  dailies: GarminDailySummary[];
  sleeps: GarminSleepSummary[];
}

export class GarminVitalsClient {
  /**
   * Mock endpoint simulating fetching data from Garmin Connect API.
   */
  async fetchVitals(
    accessToken: string,
    startDate: string,
    endDate: string,
  ): Promise<GarminPayload> {
    console.log(
      `[GarminVitals] Fetching data from ${startDate} to ${endDate} with token ${accessToken.slice(0, 4)}***`,
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 600));

    return {
      dailies: [
        {
          calendarDate: startDate,
          averageHeartRateInBeatsPerMinute: 65,
          averageStressLevel: 42,
          maxStressLevel: 88,
          bodyBatteryLowestValue: 12,
          bodyBatteryHighestValue: 95,
        },
      ],
      sleeps: [
        {
          calendarDate: startDate,
          durationInSeconds: 28800, // 8 hours
          sleepScore: 85,
        },
      ],
    };
  }

  /**
   * Syncs a patient's Garmin payload into the database.
   *
   * Idempotent over the [startDate, endDate] window: prior Garmin-sourced
   * OutcomeLogs in that range are cleared before re-inserting, so repeated
   * connect/sync presses don't pile up duplicate rows. Returns the number
   * of OutcomeLogs written.
   */
  async syncPatientData(
    patientId: string,
    accessToken: string,
    startDate: string,
    endDate: string,
  ): Promise<number> {
    const payload = await this.fetchVitals(accessToken, startDate, endDate);

    const logsToCreate: Prisma.OutcomeLogCreateManyInput[] = [];

    // 1. Process Body Battery -> OutcomeLog (energy)
    for (const daily of payload.dailies) {
      logsToCreate.push({
        patientId,
        metric: "energy" as const,
        value: daily.bodyBatteryHighestValue / 10, // Max energy of the day
        note: `Garmin Body Battery (Peak: ${daily.bodyBatteryHighestValue}, Low: ${daily.bodyBatteryLowestValue})`,
        loggedAt: new Date(daily.calendarDate),
      });

      // 2. Process Stress -> OutcomeLog (anxiety proxy)
      logsToCreate.push({
        patientId,
        metric: "anxiety" as const,
        value: daily.averageStressLevel / 10,
        note: `Garmin Average Stress Level: ${daily.averageStressLevel} (Max: ${daily.maxStressLevel})`,
        loggedAt: new Date(daily.calendarDate),
      });
    }

    // 3. Process Sleep -> OutcomeLog (sleep)
    for (const sleep of payload.sleeps) {
      logsToCreate.push({
        patientId,
        metric: "sleep" as const,
        value: sleep.sleepScore / 10,
        note: `Garmin Sleep Score: ${sleep.sleepScore} (${(sleep.durationInSeconds / 3600).toFixed(1)} hrs)`,
        loggedAt: new Date(sleep.calendarDate),
      });
    }

    if (logsToCreate.length === 0) return 0;

    // 4. Idempotent write: clear prior Garmin logs in this window, then
    // re-insert. Garmin logs are identified by the "Garmin " note prefix
    // (no source column on OutcomeLog), scoped to the synced day range so
    // we never touch a patient's manual check-ins or other integrations.
    const windowStart = new Date(`${startDate}T00:00:00.000Z`);
    const windowEnd = new Date(`${endDate}T23:59:59.999Z`);
    const written = await prisma.$transaction(async (tx) => {
      await tx.outcomeLog.deleteMany({
        where: {
          patientId,
          note: { startsWith: "Garmin " },
          loggedAt: { gte: windowStart, lte: windowEnd },
        },
      });
      const result = await tx.outcomeLog.createMany({ data: logsToCreate });
      return result.count;
    });

    console.log(`[GarminVitals] Inserted ${written} OutcomeLogs`);
    return written;
  }
}

export const garminClient = new GarminVitalsClient();
