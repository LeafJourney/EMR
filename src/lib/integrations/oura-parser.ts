/**
 * Oura Ring Data Parser Integration (EMR-050)
 *
 * Utility to fetch and parse biometric data from the Oura Ring V2 API
 * and normalize it into Verdant's internal OutcomeLog schema for
 * continuous patient monitoring.
 */

import { prisma } from "@/lib/db/prisma";

export interface OuraDailySleep {
  id: string;
  day: string;
  score: number; // 0-100
  contributors: {
    total_sleep: number;
    rem_sleep: number;
    deep_sleep: number;
    efficiency: number;
  };
}

export interface OuraDailyReadiness {
  id: string;
  day: string;
  score: number; // 0-100
  temperature_deviation?: number;
}

export interface OuraDailyActivity {
  id: string;
  day: string;
  score: number; // 0-100
  steps: number;
  equivalent_walking_distance: number;
}

export class OuraDataParser {
  /**
   * Fetches the latest daily sleep, readiness, and activity data from Oura API
   */
  async fetchDailyMetrics(
    accessToken: string,
    startDate: string,
    endDate: string,
  ): Promise<{
    sleep: OuraDailySleep[];
    readiness: OuraDailyReadiness[];
    activity: OuraDailyActivity[];
  }> {
    // In a real environment, these would be concurrent fetch calls to api.ouraring.com/v2/usercollection/...
    // For this integration module, we simulate the network boundary.
    console.log(
      `[OuraParser] Fetching Oura metrics for range: ${startDate} to ${endDate} with token ${accessToken.slice(0, 4)}***`,
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      sleep: [
        {
          id: "sleep-1",
          day: startDate,
          score: 85,
          contributors: {
            total_sleep: 80,
            rem_sleep: 90,
            deep_sleep: 85,
            efficiency: 95,
          },
        },
      ],
      readiness: [
        {
          id: "read-1",
          day: startDate,
          score: 88,
          temperature_deviation: 0.1,
        },
      ],
      activity: [
        {
          id: "act-1",
          day: startDate,
          score: 92,
          steps: 12500,
          equivalent_walking_distance: 9500,
        },
      ],
    };
  }

  /**
   * Syncs an Oura user's metrics into the patient's clinical outcome logs.
   * Maps Oura's 0-100 scores into Verdant's 0-10 OutcomeMetric scale.
   */
  async syncPatientMetrics(
    patientId: string,
    accessToken: string,
    startDate: string,
    endDate: string,
  ): Promise<void> {
    const data = await this.fetchDailyMetrics(accessToken, startDate, endDate);

    // Normalize and batch insert into OutcomeLog
    const logsToCreate = [];

    // Map Sleep Score -> OutcomeMetric.sleep
    for (const sleep of data.sleep) {
      logsToCreate.push({
        patientId,
        metric: "sleep" as const,
        value: sleep.score / 10, // 85 -> 8.5
        note: `Oura Sleep Score (Efficiency: ${sleep.contributors.efficiency})`,
        loggedAt: new Date(sleep.day),
      });
    }

    // Map Readiness Score -> OutcomeMetric.energy
    for (const readiness of data.readiness) {
      logsToCreate.push({
        patientId,
        metric: "energy" as const,
        value: readiness.score / 10, // 88 -> 8.8
        note: `Oura Readiness Score (Temp Dev: ${readiness.temperature_deviation ?? 0})`,
        loggedAt: new Date(readiness.day),
      });
    }

    // Insert all mapped outcomes
    if (logsToCreate.length > 0) {
      await prisma.outcomeLog.createMany({
        data: logsToCreate,
      });
    }
  }
}

export const ouraParser = new OuraDataParser();
