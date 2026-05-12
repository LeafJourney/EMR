/**
 * Medtronic Guardian Parser (EMR-081)
 *
 * API client to parse continuous glucose data from Medtronic CareLink/Guardian
 * sensors. Maps SG (Sensor Glucose) values to Verdant's ClinicalObservation
 * schema to track metabolic health continuously.
 */

import { prisma } from "@/lib/db/prisma";

export interface MedtronicSGReading {
  id: string;
  timestamp: string; // ISO 8601
  sgValue: number; // Sensor Glucose in mg/dL
  rateOfChange: number; // mg/dL per minute
  isCalibration: boolean;
}

export interface MedtronicDailyPayload {
  date: string;
  readings: MedtronicSGReading[];
  averageSg: number;
  timeInRangePercent: number; // 70-180 mg/dL target
}

export class MedtronicParserClient {
  /**
   * Mock endpoint simulating fetching data from Medtronic CareLink APIs.
   */
  async fetchCareLinkData(
    patientId: string,
    accessToken: string,
    date: string,
  ): Promise<MedtronicDailyPayload> {
    console.log(
      `[MedtronicParser] Fetching CareLink data for patient ${patientId} on ${date}`,
    );

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 600));

    return {
      date,
      averageSg: 110,
      timeInRangePercent: 92,
      readings: [
        {
          id: `medtronic-${date}-1`,
          timestamp: `${date}T09:00:00Z`,
          sgValue: 105,
          rateOfChange: 0.5,
          isCalibration: false,
        },
        {
          id: `medtronic-${date}-2`,
          timestamp: `${date}T13:00:00Z`,
          sgValue: 195, // Hyperglycemic
          rateOfChange: 2.1,
          isCalibration: false,
        },
        {
          id: `medtronic-${date}-3`,
          timestamp: `${date}T16:00:00Z`,
          sgValue: 68, // Hypoglycemic
          rateOfChange: -1.5,
          isCalibration: false,
        },
      ],
    };
  }

  /**
   * Syncs a patient's Medtronic daily payload into the Verdant schema.
   */
  async syncPatientData(
    patientId: string,
    accessToken: string,
    date: string,
  ): Promise<void> {
    const payload = await this.fetchCareLinkData(patientId, accessToken, date);

    const observationsToCreate = [];

    // 1. Log the daily summary (Average and Time in Range)
    observationsToCreate.push({
      patientId,
      observedBy: "system:medtronic-cgm",
      observedByKind: "agent",
      category: "engagement" as const, // Metabolic control engagement
      severity:
        payload.timeInRangePercent >= 70
          ? ("info" as const)
          : ("concern" as const),
      summary: `Medtronic Guardian Daily Summary: ${payload.timeInRangePercent}% in range, Avg ${payload.averageSg} mg/dL.`,
      metadata: {
        tir: payload.timeInRangePercent,
        avgGlucose: payload.averageSg,
      },
      createdAt: new Date(payload.date),
    });

    // 2. Scan for critical outliers (Highs / Lows)
    for (const reading of payload.readings) {
      if (reading.sgValue > 180) {
        observationsToCreate.push({
          patientId,
          observedBy: "system:medtronic-cgm",
          observedByKind: "agent",
          category: "side_effect" as const,
          severity: "concern" as const,
          summary: `Glucose Spike Detected (Guardian): ${reading.sgValue} mg/dL`,
          metadata: {
            readingId: reading.id,
            sgValue: reading.sgValue,
            rateOfChange: reading.rateOfChange,
          },
          createdAt: new Date(reading.timestamp),
        });
      }

      if (reading.sgValue < 70) {
        observationsToCreate.push({
          patientId,
          observedBy: "system:medtronic-cgm",
          observedByKind: "agent",
          category: "side_effect" as const,
          severity: "urgent" as const, // Hypoglycemia is critical
          summary: `Hypoglycemic Event Detected (Guardian): ${reading.sgValue} mg/dL`,
          metadata: {
            readingId: reading.id,
            sgValue: reading.sgValue,
            rateOfChange: reading.rateOfChange,
          },
          createdAt: new Date(reading.timestamp),
        });
      }
    }

    // 3. Batch Insert
    if (observationsToCreate.length > 0) {
      await prisma.clinicalObservation.createMany({
        data: observationsToCreate,
      });
      console.log(
        `[MedtronicParser] Inserted ${observationsToCreate.length} ClinicalObservations`,
      );
    }
  }
}

export const medtronicParser = new MedtronicParserClient();
