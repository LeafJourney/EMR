/**
 * Dexcom CGM API Client (EMR-055)
 *
 * Client for fetching continuous glucose monitoring (CGM) data from Dexcom.
 * Normalizes blood glucose (mg/dL) readings into Verdant's internal
 * ClinicalObservation schema to track metabolic health continuously.
 */

import { prisma } from "@/lib/db/prisma";

export interface DexcomEGVReading {
  systemTime: string; // ISO 8601
  displayTime: string; // ISO 8601 local time
  value: number; // in mg/dL
  trend: "doubleUp" | "singleUp" | "fortyFiveUp" | "flat" | "fortyFiveDown" | "singleDown" | "doubleDown" | "none" | "notComputable" | "rateOutOfRange";
  trendRate?: number;
}

export interface DexcomDailyPayload {
  date: string;
  egvs: DexcomEGVReading[];
  timeInRangePercent: number; // 70-180 mg/dL target
  averageGlucose: number;
}

export class DexcomCgmClient {
  /**
   * Mock endpoint simulating fetching data from Dexcom API (e.g. /v3/users/self/egvs).
   */
  async fetchEgvsData(
    accessToken: string,
    date: string,
  ): Promise<DexcomDailyPayload> {
    console.log(
      `[DexcomCgm] Fetching EGV data for ${date} with token ${accessToken.slice(0, 4)}***`,
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 550));

    return {
      date,
      timeInRangePercent: 85,
      averageGlucose: 108,
      egvs: [
        {
          systemTime: `${date}T08:00:00Z`,
          displayTime: `${date}T04:00:00`,
          value: 100,
          trend: "flat",
        },
        {
          systemTime: `${date}T12:30:00Z`,
          displayTime: `${date}T08:30:00`,
          value: 190, // Hyperglycemic
          trend: "singleUp",
        },
        {
          systemTime: `${date}T15:00:00Z`,
          displayTime: `${date}T11:00:00`,
          value: 65, // Hypoglycemic
          trend: "singleDown",
        },
      ],
    };
  }

  /**
   * Synchronizes a patient's Dexcom daily payload into the database.
   */
  async syncPatientData(
    patientId: string,
    accessToken: string,
    date: string,
  ): Promise<void> {
    const payload = await this.fetchEgvsData(accessToken, date);

    const observationsToCreate = [];

    // 1. Log the daily summary (Average and Time in Range)
    observationsToCreate.push({
      patientId,
      observedBy: "system:dexcom-cgm",
      observedByKind: "agent",
      category: "engagement" as const,
      severity:
        payload.timeInRangePercent >= 70
          ? ("info" as const)
          : ("concern" as const),
      summary: `Dexcom CGM Daily Summary: ${payload.timeInRangePercent}% in range, Avg ${payload.averageGlucose} mg/dL.`,
      metadata: {
        tir: payload.timeInRangePercent,
        avgGlucose: payload.averageGlucose,
      },
      createdAt: new Date(payload.date),
    });

    // 2. Scan for critical outliers (Highs / Lows)
    for (const reading of payload.egvs) {
      if (reading.value > 180) {
        observationsToCreate.push({
          patientId,
          observedBy: "system:dexcom-cgm",
          observedByKind: "agent",
          category: "side_effect" as const,
          severity: "concern" as const,
          summary: `Glucose Spike Detected (Dexcom): ${reading.value} mg/dL (${reading.trend})`,
          metadata: {
            value: reading.value,
            trend: reading.trend,
            trendRate: reading.trendRate,
          },
          createdAt: new Date(reading.systemTime),
        });
      }

      if (reading.value < 70) {
        observationsToCreate.push({
          patientId,
          observedBy: "system:dexcom-cgm",
          observedByKind: "agent",
          category: "side_effect" as const,
          severity: "urgent" as const, // Hypoglycemia is critical
          summary: `Hypoglycemic Event Detected (Dexcom): ${reading.value} mg/dL (${reading.trend})`,
          metadata: {
            value: reading.value,
            trend: reading.trend,
            trendRate: reading.trendRate,
          },
          createdAt: new Date(reading.systemTime),
        });
      }
    }

    // 3. Batch DB insertions
    if (observationsToCreate.length > 0) {
      await prisma.clinicalObservation.createMany({
        data: observationsToCreate,
      });
      console.log(
        `[DexcomCgm] Inserted ${observationsToCreate.length} ClinicalObservations`,
      );
    }
  }
}

export const dexcomClient = new DexcomCgmClient();
