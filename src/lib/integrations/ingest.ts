/**
 * Shared, idempotent OutcomeLog ingest for wearable integrations.
 *
 * Each provider tags its notes with a stable prefix ("Oura ", "Whoop ",
 * "Apple Health ", …). We replace per-(metric, loggedAt) rather than blanket-
 * clearing a window, so repeated syncs, overlapping ranges, and partial
 * webhook deliveries never pile up duplicates or clobber a sibling metric on
 * the same day. Manual check-ins and other providers are never touched
 * (matched only by the source prefix). Relies on loggedAt being a stable key
 * (callers set it to the UTC midnight of the summary day).
 *
 * Mirrors the Garmin ingest semantics; kept generic so every cloud provider
 * shares one well-tested code path.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { evaluatePatientCDS } from "@/lib/cds/engine";
import { routeCDSTriggers } from "@/lib/cds/alerts";

export async function ingestOutcomeLogs(
  patientId: string,
  rows: Prisma.OutcomeLogCreateManyInput[],
  opts: { prefix: string },
): Promise<number> {
  if (rows.length === 0) return 0;

  const keys = rows.map((r) => ({
    metric: r.metric,
    loggedAt: r.loggedAt as Date,
  }));

  const written = await prisma.$transaction(async (tx) => {
    await tx.outcomeLog.deleteMany({
      where: {
        patientId,
        note: { startsWith: opts.prefix },
        OR: keys,
      },
    });
    const result = await tx.outcomeLog.createMany({ data: rows });
    return result.count;
  });

  return written;
}

/**
 * Idempotent write of provider-sourced ClinicalObservations for a set of
 * days. Deletes prior same-source rows on those days (by observedBy +
 * createdAt) before inserting, so repeated syncs don't pile up.
 */
export async function ingestObservations(
  patientId: string,
  rows: Prisma.ClinicalObservationCreateManyInput[],
  opts: { observedBy: string },
): Promise<number> {
  if (rows.length === 0) return 0;
  const createdAts = rows.map((r) => r.createdAt as Date).filter(Boolean);

  const written = await prisma.$transaction(async (tx) => {
    if (createdAts.length > 0) {
      await tx.clinicalObservation.deleteMany({
        where: {
          patientId,
          observedBy: opts.observedBy,
          OR: createdAts.map((createdAt) => ({ createdAt })),
        },
      });
    }
    const result = await tx.clinicalObservation.createMany({ data: rows });
    return result.count;
  });

  return written;
}

/**
 * Evaluate the wearables CDS rules on the patient's last 24h and route any
 * triggers. Never throws — the biometric data is already persisted.
 */
export async function evaluateWearableCDS(patientId: string): Promise<void> {
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
    console.error("[wearables] CDS evaluation failed (data persisted):", err);
  }
}
