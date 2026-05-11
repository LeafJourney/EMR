/**
 * FreeStyle Libre CGM API Client (EMR-080)
 *
 * Client for fetching continuous glucose monitoring (CGM) data from Abbott's FreeStyle Libre
 * system. Normalizes blood glucose (mg/dL) readings into Verdant's internal
 * ClinicalObservation schema to track metabolic health continuously.
 */

import { prisma } from "@/lib/db/prisma";

export interface LibreGlucoseReading {
  id: string;
  timestamp: string;
  value: number; // in mg/dL
  trendArrow:
    | "rising_quickly"
    | "rising"
    | "stable"
    | "falling"
    | "falling_quickly";
  isHigh: boolean;
  isLow: boolean;
}

export interface LibreDailyPayload {
  date: string;
  readings: LibreGlucoseReading[];
  timeInTargetRangePercent: number; // 0-100%
  averageGlucose: number;
}

export class LibreCgmClient {
  /**
   * Mock endpoint simulating fetching data from LibreView/LibreLinkUp API.
   * In production, this uses an authenticated token for the Libre system.
   */
  async fetchGlucoseData(
    accessToken: string,
    date: string,
  ): Promise<LibreDailyPayload> {
    console.log(
      `[LibreCgm] Fetching glucose data for ${date} with token ${accessToken.slice(0, 4)}***`,
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 550));

    // Simulated payload with synthetic glucose readings
    return {
      date,
      timeInTargetRangePercent: 88,
      averageGlucose: 105,
      readings: [
        {
          id: `libre-${date}-1`,
          timestamp: `${date}T08:00:00Z`,
          value: 95,
          trendArrow: "stable",
          isHigh: false,
          isLow: false,
        },
        {
          id: `libre-${date}-2`,
          timestamp: `${date}T12:30:00Z`,
          value: 145, // Post-prandial spike
          trendArrow: "rising",
          isHigh: false,
          isLow: false,
        },
        {
          id: `libre-${date}-3`,
          timestamp: `${date}T15:00:00Z`,
          value: 75,
          trendArrow: "falling",
          isHigh: false,
          isLow: false,
        },
      ],
    };
  }

  /**
   * Synchronizes a patient's Libre daily payload into the database.
   * Since continuous glucose doesn't neatly map to a 0-10 OutcomeMetric,
   * we log critical spikes, lows, and daily summaries as ClinicalObservations.
   */
  async syncPatientData(
    patientId: string,
    accessToken: string,
    date: string,
  ): Promise<void> {
    const payload = await this.fetchGlucoseData(accessToken, date);

    const observationsToCreate = [];

    // 1. Log the daily summary (Average and Time in Range)
    observationsToCreate.push({
      patientId,
      observedBy: "system:libre-cgm",
      observedByKind: "agent",
      category: "engagement" as const, // Metabolic engagement/control
      severity:
        payload.timeInTargetRangePercent >= 70
          ? ("info" as const)
          : ("concern" as const),
      summary: `Libre CGM Daily Summary: ${payload.timeInTargetRangePercent}% in range, Avg ${payload.averageGlucose} mg/dL.`,
      metadata: {
        tir: payload.timeInTargetRangePercent,
        avgGlucose: payload.averageGlucose,
      },
      createdAt: new Date(payload.date),
    });

    // 2. Scan for critical outliers (Highs / Lows)
    for (const reading of payload.readings) {
      if (reading.isHigh || reading.value > 180) {
        observationsToCreate.push({
          patientId,
          observedBy: "system:libre-cgm",
          observedByKind: "agent",
          category: "side_effect" as const, // Could be metabolic reaction
          severity: "concern" as const,
          summary: `Glucose Spike Detected: ${reading.value} mg/dL (${reading.trendArrow})`,
          metadata: { 
            readingId: reading.id, 
            value: reading.value, 
            trend: reading.trendArrow 
          },
          createdAt: new Date(reading.timestamp),
        });
      }

      if (reading.isLow || reading.value < 70) {
        observationsToCreate.push({
          patientId,
          observedBy: "system:libre-cgm",
          observedByKind: "agent",
          category: "side_effect" as const,
          severity: "urgent" as const, // Hypoglycemia is critical
          summary: `Hypoglycemic Event Detected: ${reading.value} mg/dL (${reading.trendArrow})`,
          metadata: { 
            readingId: reading.id, 
            value: reading.value, 
            trend: reading.trendArrow 
          },
          createdAt: new Date(reading.timestamp),
        });
      }
    }

    // 3. Batch DB insertions
    if (observationsToCreate.length > 0) {
      await prisma.clinicalObservation.createMany({
        data: observationsToCreate,
      });
      console.log(
        `[LibreCgm] Inserted ${observationsToCreate.length} ClinicalObservations`,
      );
    }
  }
}

export const libreClient = new LibreCgmClient();
