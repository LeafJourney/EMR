"use server";

// EMR-054 — patient portal device/wearable connections.
//
// Replaces the client-only toggle state on the Integrations page with real
// per-patient persistence (DeviceConnection). Connecting or syncing Garmin
// additionally runs a live ingestion pass — GarminVitalsClient writes Body
// Battery / Stress / Sleep into the patient's OutcomeLog series — and then
// evaluates the wearables CDS rules so a fresh sync can raise a care-team
// alert, mirroring the cron/sync-wearables daemon.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/domain/audit-logger";
import { garminClient } from "@/lib/integrations/garmin-vitals";
import { evaluatePatientCDS } from "@/lib/cds/engine";
import { routeCDSTriggers } from "@/lib/cds/alerts";
import {
  isDeviceProvider,
  type DeviceActionResult,
  type DeviceConnectionState,
} from "./providers";

/** How many trailing days of history to pull on a Garmin connect/sync. */
const GARMIN_BACKFILL_DAYS = 7;

async function requirePatient(): Promise<{
  id: string;
  organizationId: string;
  userId: string;
}> {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, organizationId: true },
  });
  if (!patient) throw new Error("FORBIDDEN");
  return { ...patient, userId: user.id };
}

function toState(row: {
  connected: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
}): DeviceConnectionState {
  return {
    connected: row.connected,
    lastSync: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    error: row.lastError,
  };
}

/**
 * Loads the signed-in patient's saved connections, keyed by provider slug.
 * Providers with no row yet are simply absent (treated as disconnected by
 * the UI), so the page never has to backfill rows just to render.
 */
export async function getDeviceConnections(): Promise<
  Record<string, DeviceConnectionState>
> {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
  if (!patient) return {};

  const rows = await prisma.deviceConnection.findMany({
    where: { patientId: patient.id },
  });

  const out: Record<string, DeviceConnectionState> = {};
  for (const row of rows) out[row.provider] = toState(row);
  return out;
}

/**
 * Runs a Garmin ingestion pass for the patient over the backfill window and
 * fires the wearables CDS rules on the freshly written data. Returns the
 * number of OutcomeLogs written. CDS failures never fail the sync — the
 * data is already persisted.
 */
async function runGarminSync(
  patientId: string,
  accessToken: string,
): Promise<number> {
  const end = new Date();
  const start = new Date(end.getTime() - GARMIN_BACKFILL_DAYS * 86_400_000);
  const startDate = start.toISOString().split("T")[0];
  const endDate = end.toISOString().split("T")[0];

  const recordsSynced = await garminClient.syncPatientData(
    patientId,
    accessToken,
    startDate,
    endDate,
  );

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

  return recordsSynced;
}

/**
 * Connects a device for the signed-in patient. For Garmin this also pulls
 * the trailing week of biometrics into the patient's outcome history.
 */
export async function connectDevice(
  provider: string,
): Promise<DeviceActionResult> {
  if (!isDeviceProvider(provider)) return { ok: false, error: "Unknown device." };
  const patient = await requirePatient();

  // Mock OAuth handshake — the live flow lands with the provider SDK work.
  const accessToken = `mock-${provider}-token`;

  let recordsSynced = 0;
  let lastError: string | null = null;
  let lastSyncedAt: Date | null = null;

  if (provider === "garmin") {
    try {
      recordsSynced = await runGarminSync(patient.id, accessToken);
      lastSyncedAt = new Date();
    } catch (err) {
      console.error("[Garmin] connect sync failed:", err);
      lastError = "We couldn't reach Garmin Connect. Please try again.";
    }
  }

  const row = await prisma.deviceConnection.upsert({
    where: { patientId_provider: { patientId: patient.id, provider } },
    create: {
      patientId: patient.id,
      provider,
      connected: true,
      accessToken,
      lastSyncedAt,
      lastError,
    },
    update: {
      connected: true,
      accessToken,
      ...(lastSyncedAt ? { lastSyncedAt } : {}),
      lastError,
    },
  });

  await createAuditLog({
    organizationId: patient.organizationId,
    actorId: patient.userId,
    targetId: patient.id,
    action: "patient.device_connected",
    metadata: { provider, recordsSynced },
  });

  revalidatePath("/portal/integrations");
  return { ok: true, state: toState(row), recordsSynced };
}

/** Disconnects a device and clears its stored access token. */
export async function disconnectDevice(
  provider: string,
): Promise<DeviceActionResult> {
  if (!isDeviceProvider(provider)) return { ok: false, error: "Unknown device." };
  const patient = await requirePatient();

  const row = await prisma.deviceConnection.upsert({
    where: { patientId_provider: { patientId: patient.id, provider } },
    create: { patientId: patient.id, provider, connected: false },
    update: { connected: false, accessToken: null, lastError: null },
  });

  await createAuditLog({
    organizationId: patient.organizationId,
    actorId: patient.userId,
    targetId: patient.id,
    action: "patient.device_disconnected",
    metadata: { provider },
  });

  revalidatePath("/portal/integrations");
  return { ok: true, state: toState(row) };
}

/**
 * Re-runs a sync for an already-connected device. Garmin pulls fresh
 * biometrics; other providers just stamp the sync time until their own
 * ingestion pipeline lands.
 */
export async function syncDevice(
  provider: string,
): Promise<DeviceActionResult> {
  if (!isDeviceProvider(provider)) return { ok: false, error: "Unknown device." };
  const patient = await requirePatient();

  const existing = await prisma.deviceConnection.findUnique({
    where: { patientId_provider: { patientId: patient.id, provider } },
  });
  if (!existing || !existing.connected) {
    return { ok: false, error: "Connect this device before syncing." };
  }

  let recordsSynced = 0;
  let lastError: string | null = null;

  if (provider === "garmin") {
    try {
      recordsSynced = await runGarminSync(
        patient.id,
        existing.accessToken ?? `mock-${provider}-token`,
      );
    } catch (err) {
      console.error("[Garmin] manual sync failed:", err);
      lastError = "We couldn't reach Garmin Connect. Please try again.";
    }
  }

  const row = await prisma.deviceConnection.update({
    where: { patientId_provider: { patientId: patient.id, provider } },
    data: {
      ...(lastError ? {} : { lastSyncedAt: new Date() }),
      lastError,
    },
  });

  await createAuditLog({
    organizationId: patient.organizationId,
    actorId: patient.userId,
    targetId: patient.id,
    action: "patient.device_synced",
    metadata: { provider, recordsSynced },
  });

  revalidatePath("/portal/integrations");
  if (lastError) return { ok: false, error: lastError };
  return { ok: true, state: toState(row), recordsSynced };
}
