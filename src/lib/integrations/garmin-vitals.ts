/**
 * Garmin Vitals — payload types + pure mapping/ingest into OutcomeLog (EMR-054).
 *
 * This module is the SHARED, side-effect-light core reused by every Garmin
 * code path (synchronous pull, webhook push, mock demo):
 *
 *   - the GarminPayload shape (what the Health API gives us, normalised),
 *   - mapGarminPayload(): pure payload -> OutcomeLog rows,
 *   - ingestGarminPayload(): idempotent write of those rows,
 *   - evaluateGarminCDS(): fire the wearables CDS rules on fresh data.
 *
 * The real HTTP fetch lives in ./garmin/client.ts; the OAuth handshake in
 * ./garmin/oauth.ts; the mode guardrail in ./garmin/config.ts; orchestration
 * in ./garmin/sync.ts. Keeping the mapping pure here makes it trivially
 * unit-testable and identical whether data arrived by pull or by webhook.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { evaluatePatientCDS } from "@/lib/cds/engine";
import { routeCDSTriggers } from "@/lib/cds/alerts";

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

export interface IngestOptions {
  /** Mark every note "(SIMULATED)" so demo data can never be mistaken for —
   *  or exported as — real clinical data. */
  simulated: boolean;
}

/** The note prefix that identifies a Garmin-sourced OutcomeLog. Used for the
 *  idempotent clear; OutcomeLog has no `source` column. */
export const GARMIN_NOTE_PREFIX = "Garmin ";

function tag(simulated: boolean): string {
  return simulated ? "Garmin (SIMULATED) " : GARMIN_NOTE_PREFIX;
}

/**
 * Pure mapping: GarminPayload -> OutcomeLog create rows. No DB access, so it
 * can be exercised directly in unit tests for either source path.
 */
export function mapGarminPayload(
  patientId: string,
  payload: GarminPayload,
  simulated: boolean,
): Prisma.OutcomeLogCreateManyInput[] {
  const prefix = tag(simulated);
  const logs: Prisma.OutcomeLogCreateManyInput[] = [];

  for (const daily of payload.dailies) {
    // Body Battery (peak) -> energy
    logs.push({
      patientId,
      metric: "energy",
      value: daily.bodyBatteryHighestValue / 10,
      note: `${prefix}Body Battery (Peak: ${daily.bodyBatteryHighestValue}, Low: ${daily.bodyBatteryLowestValue})`,
      loggedAt: new Date(daily.calendarDate),
    });
    // Average stress -> anxiety proxy
    logs.push({
      patientId,
      metric: "anxiety",
      value: daily.averageStressLevel / 10,
      note: `${prefix}Average Stress Level: ${daily.averageStressLevel} (Max: ${daily.maxStressLevel})`,
      loggedAt: new Date(daily.calendarDate),
    });
  }

  for (const sleep of payload.sleeps) {
    logs.push({
      patientId,
      metric: "sleep",
      value: sleep.sleepScore / 10,
      note: `${prefix}Sleep Score: ${sleep.sleepScore} (${(sleep.durationInSeconds / 3600).toFixed(1)} hrs)`,
      loggedAt: new Date(sleep.calendarDate),
    });
  }

  return logs;
}

/**
 * Idempotent write of a Garmin payload. For each (metric, day) about to be
 * written, the prior Garmin-sourced row for that exact (metric, loggedAt) is
 * deleted first, then re-inserted — so repeated syncs, overlapping windows,
 * AND partial webhook pushes (where dailies and sleeps arrive in separate
 * deliveries) never pile up duplicates and never clobber a sibling metric on
 * the same day. Manual check-ins and other integrations are untouched
 * (matched only by the "Garmin " note prefix). Returns the rows written.
 *
 * Relies on loggedAt being the UTC midnight of calendarDate (set in
 * mapGarminPayload), so equality matching is stable across pushes.
 */
export async function ingestGarminPayload(
  patientId: string,
  payload: GarminPayload,
  opts: IngestOptions,
): Promise<number> {
  const logsToCreate = mapGarminPayload(patientId, payload, opts.simulated);
  if (logsToCreate.length === 0) return 0;

  const keys = logsToCreate.map((l) => ({
    metric: l.metric,
    loggedAt: l.loggedAt as Date,
  }));

  const written = await prisma.$transaction(async (tx) => {
    await tx.outcomeLog.deleteMany({
      where: {
        patientId,
        // Matches both "Garmin " and "Garmin (SIMULATED) ".
        note: { startsWith: GARMIN_NOTE_PREFIX },
        OR: keys,
      },
    });
    const result = await tx.outcomeLog.createMany({ data: logsToCreate });
    return result.count;
  });

  console.log(`[GarminVitals] Inserted ${written} OutcomeLogs`);
  return written;
}

/**
 * Evaluate the wearables CDS rules on the patient's last 24h of data and
 * route any triggers to the care team. Never throws — the biometric data is
 * already persisted; a CDS hiccup must not fail the sync.
 */
export async function evaluateGarminCDS(patientId: string): Promise<void> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [logs, observations] = await Promise.all([
      prisma.outcomeLog.findMany({
        where: { patientId, loggedAt: { gte: since } },
      }),
      prisma.clinicalObservation.findMany({
        where: { patientId, createdAt: { gte: since } },
      }),
    ]);
    const triggers = evaluatePatientCDS(patientId, logs, observations);
    if (triggers.length > 0) await routeCDSTriggers(triggers);
  } catch (err) {
    console.error("[Garmin] CDS evaluation failed (data was persisted):", err);
  }
}
