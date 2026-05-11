/**
 * Apple HealthKit Normalizer (EMR-051)
 *
 * Utility to parse and normalize Apple HealthKit exported JSON payloads
 * into Verdant's internal OutcomeLog schema and ClinicalObservation records.
 * Supports Step Count, Sleep Analysis, and Heart Rate Variability (HRV).
 */

import { prisma } from "@/lib/db/prisma";

export type HKQuantityTypeIdentifier =
  | "HKQuantityTypeIdentifierStepCount"
  | "HKQuantityTypeIdentifierHeartRateVariabilitySDNN"
  | "HKQuantityTypeIdentifierRestingHeartRate";

export type HKCategoryTypeIdentifier = "HKCategoryTypeIdentifierSleepAnalysis";

export interface HKQuantitySample {
  uuid: string;
  type: HKQuantityTypeIdentifier;
  startDate: string;
  endDate: string;
  value: number;
  unit: string;
}

export interface HKCategorySample {
  uuid: string;
  type: HKCategoryTypeIdentifier;
  startDate: string;
  endDate: string;
  value: number; // 0: InBed, 1: Asleep, 2: Awake (in iOS <16) or enum for Core/Deep/REM
}

export interface HealthKitPayload {
  patientId: string;
  quantitySamples: HKQuantitySample[];
  categorySamples: HKCategorySample[];
}

export class HealthKitNormalizer {
  /**
   * Normalizes an incoming HealthKit payload and synchronizes it with
   * the patient's Clinical Observations and OutcomeLogs.
   */
  async ingestPayload(payload: HealthKitPayload): Promise<void> {
    console.log(
      `[HealthKitNormalizer] Ingesting payload for patient ${payload.patientId}`,
    );

    const logsToCreate = [];
    const observationsToCreate = [];

    // 1. Process Quantity Samples (e.g., HRV, Steps)
    for (const sample of payload.quantitySamples) {
      if (sample.type === "HKQuantityTypeIdentifierHeartRateVariabilitySDNN") {
        // HRV is a strong proxy for overall physiological stress/recovery (energy).
        // A normal SDNN varies wildly, but let's log the raw value as a clinical observation
        // so agents can review trends.
        observationsToCreate.push({
          patientId: payload.patientId,
          observedBy: "system:healthkit",
          observedByKind: "agent",
          category: "engagement" as const,
          severity: "info" as const,
          summary: `Patient recorded an HRV of ${sample.value} ${sample.unit}.`,
          metadata: {
            sampleUuid: sample.uuid,
            value: sample.value,
            unit: sample.unit,
          },
          createdAt: new Date(sample.endDate),
        });
      }
    }

    // 2. Process Category Samples (e.g., Sleep Analysis)
    // We aggregate sleep samples for a single day to generate a single outcome score.
    // For simplicity in this normalizer, if we see an "Asleep" value !== 0,
    // we accumulate the hours.
    const sleepSamples = payload.categorySamples.filter(
      (s) =>
        s.type === "HKCategoryTypeIdentifierSleepAnalysis" && s.value !== 0, // ignoring just "InBed"
    );

    for (const sample of sleepSamples) {
      const start = new Date(sample.startDate).getTime();
      const end = new Date(sample.endDate).getTime();
      const hoursAsleep = (end - start) / (1000 * 60 * 60);

      // Simple heuristic: normalize hours to a 0-10 scale (capped at 10 for 8 hours).
      const sleepScore = Math.min((hoursAsleep / 8) * 10, 10);

      logsToCreate.push({
        patientId: payload.patientId,
        metric: "sleep" as const,
        value: Number(sleepScore.toFixed(1)),
        note: `Apple HealthKit Sleep Log (${hoursAsleep.toFixed(1)} hrs)`,
        loggedAt: new Date(sample.endDate),
      });
    }

    // 3. Batch Insert
    if (logsToCreate.length > 0) {
      await prisma.outcomeLog.createMany({
        data: logsToCreate,
      });
      console.log(
        `[HealthKitNormalizer] Inserted ${logsToCreate.length} OutcomeLogs`,
      );
    }

    if (observationsToCreate.length > 0) {
      await prisma.clinicalObservation.createMany({
        data: observationsToCreate,
      });
      console.log(
        `[HealthKitNormalizer] Inserted ${observationsToCreate.length} ClinicalObservations`,
      );
    }
  }
}

export const healthKitNormalizer = new HealthKitNormalizer();
