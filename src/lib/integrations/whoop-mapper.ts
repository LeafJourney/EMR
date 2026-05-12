/**
 * Whoop Strain Score Mapper (EMR-053)
 *
 * API client to parse biometric data from the Whoop API.
 * Maps Whoop's proprietary Strain (0-21) and Recovery (0-100%) scores
 * into Verdant's OutcomeLog and ClinicalObservation schema.
 */

import { prisma } from "@/lib/db/prisma";

export interface WhoopDailyCycle {
  id: string;
  date: string;
  score: {
    strain: number; // 0-21 scale
    kilojoules: number;
    average_heart_rate: number;
    max_heart_rate: number;
  };
}

export interface WhoopRecovery {
  cycle_id: string;
  score: {
    recovery_score: number; // 0-100%
    resting_heart_rate: number;
    hrv_rmssd: number; // Heart Rate Variability
    sleep_performance_percentage: number;
  };
}

export interface WhoopPayload {
  cycle: WhoopDailyCycle;
  recovery: WhoopRecovery;
}

export class WhoopMapperClient {
  /**
   * Mock endpoint simulating fetching data from Whoop API.
   */
  async fetchDailyMetrics(
    accessToken: string,
    date: string,
  ): Promise<WhoopPayload> {
    console.log(
      `[WhoopMapper] Fetching data for ${date} with token ${accessToken.slice(0, 4)}***`,
    );

    await new Promise((resolve) => setTimeout(resolve, 600));

    return {
      cycle: {
        id: `whoop-cycle-${date}`,
        date,
        score: {
          strain: 14.2, // Moderate to high strain
          kilojoules: 8500,
          average_heart_rate: 68,
          max_heart_rate: 165,
        },
      },
      recovery: {
        cycle_id: `whoop-cycle-${date}`,
        score: {
          recovery_score: 82, // Green recovery
          resting_heart_rate: 55,
          hrv_rmssd: 68,
          sleep_performance_percentage: 95,
        },
      },
    };
  }

  /**
   * Syncs a patient's Whoop daily payload into the database.
   */
  async syncPatientData(
    patientId: string,
    accessToken: string,
    date: string,
  ): Promise<void> {
    const payload = await this.fetchDailyMetrics(accessToken, date);

    const logsToCreate = [];
    const observationsToCreate = [];

    // 1. Process Recovery -> OutcomeLog (energy)
    // Whoop Recovery is 0-100. We map it to 0-10.
    logsToCreate.push({
      patientId,
      metric: "energy" as const,
      value: payload.recovery.score.recovery_score / 10,
      note: `Whoop Recovery Score: ${payload.recovery.score.recovery_score}% (HRV: ${payload.recovery.score.hrv_rmssd})`,
      loggedAt: new Date(payload.cycle.date),
    });

    // 2. Process Sleep Performance -> OutcomeLog (sleep)
    logsToCreate.push({
      patientId,
      metric: "sleep" as const,
      value: Math.min(
        (payload.recovery.score.sleep_performance_percentage / 100) * 10,
        10,
      ),
      note: `Whoop Sleep Performance: ${payload.recovery.score.sleep_performance_percentage}%`,
      loggedAt: new Date(payload.cycle.date),
    });

    // 3. Process Strain -> ClinicalObservation
    // Strain is proprietary 0-21. Over 14 is high.
    const isHighStrain = payload.cycle.score.strain > 14;
    observationsToCreate.push({
      patientId,
      observedBy: "system:whoop",
      observedByKind: "agent",
      category: "lifestyle_shift" as const,
      severity: isHighStrain ? ("notable" as const) : ("info" as const),
      summary: `Whoop Strain logged at ${payload.cycle.score.strain}/21.`,
      metadata: {
        strain: payload.cycle.score.strain,
        maxHR: payload.cycle.score.max_heart_rate,
      },
      createdAt: new Date(payload.cycle.date),
    });

    // 4. Batch DB insertions
    if (logsToCreate.length > 0) {
      await prisma.outcomeLog.createMany({ data: logsToCreate });
      console.log(
        `[WhoopMapper] Inserted ${logsToCreate.length} OutcomeLogs`,
      );
    }

    if (observationsToCreate.length > 0) {
      await prisma.clinicalObservation.createMany({
        data: observationsToCreate,
      });
      console.log(
        `[WhoopMapper] Inserted ${observationsToCreate.length} ClinicalObservations`,
      );
    }
  }
}

export const whoopClient = new WhoopMapperClient();
