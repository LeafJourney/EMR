"use server";

// EMR-054 — patient portal device/wearable connections.
//
// Per-patient persistence (DeviceConnection) for the Integrations page, now
// gated by the Garmin mode guardrail (src/lib/integrations/garmin/config.ts):
//
//   - A provider is only connectable when it has a real backend. Today that's
//     Garmin alone — and only when configured ("live") or explicitly opted
//     into the non-prod demo ("mock"). Every other card is "Coming soon".
//   - Live Garmin connects via OAuth redirect (handled by the /connect +
//     /callback routes); this action returns the redirect URL.
//   - Mock Garmin runs an inline simulated ingest, tagged "(SIMULATED)", so a
//     demo never writes fabricated data that looks real.
//
// Connecting/syncing Garmin runs an ingestion pass (syncGarminConnection ->
// OutcomeLog) and evaluates the wearables CDS rules, mirroring the webhook
// path.

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/domain/audit-logger";
import {
  syncGarminConnection,
  loadLiveToken,
  GarminReconnectError,
} from "@/lib/integrations/garmin/sync";
import { garminHealthClient } from "@/lib/integrations/garmin/client";
import { providerAvailability } from "./availability";
import {
  isDeviceProvider,
  type DeviceActionResult,
  type DeviceConnectionState,
} from "./providers";

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

/** Map a sync error to a patient-friendly message. */
function syncErrorMessage(err: unknown): string {
  if (err instanceof GarminReconnectError) {
    return "Your Garmin connection expired. Please reconnect Garmin.";
  }
  return "We couldn't reach Garmin Connect. Please try again.";
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
 * Connects a device for the signed-in patient.
 *
 * - Refuses any provider that isn't actually connectable (guardrail).
 * - Live Garmin returns a redirect to the OAuth start route.
 * - Mock Garmin runs an inline simulated ingest.
 */
export async function connectDevice(
  provider: string,
): Promise<DeviceActionResult> {
  if (!isDeviceProvider(provider)) return { ok: false, error: "Unknown device." };

  const availability = providerAvailability(provider);
  if (!availability.available) {
    return { ok: false, error: "This integration isn't available to connect yet." };
  }

  const patient = await requirePatient();

  if (provider === "garmin" && availability.connectKind === "oauth-redirect") {
    // The real connect happens in the /callback route after Garmin consent.
    return { ok: true, redirect: "/api/integrations/garmin/connect" };
  }

  // Inline path (mock-mode Garmin demo). Real providers never reach here.
  let recordsSynced = 0;
  let lastError: string | null = null;
  let lastSyncedAt: Date | null = null;

  try {
    recordsSynced = await syncGarminConnection({
      patientId: patient.id,
      accessToken: null,
      accessTokenSecret: null,
    });
    lastSyncedAt = new Date();
  } catch (err) {
    console.error("[Garmin] connect (mock) sync failed:", err);
    lastError = syncErrorMessage(err);
  }

  const row = await prisma.deviceConnection.upsert({
    where: { patientId_provider: { patientId: patient.id, provider } },
    create: {
      patientId: patient.id,
      provider,
      connected: true,
      mode: availability.mode,
      lastSyncedAt,
      lastError,
    },
    update: {
      connected: true,
      mode: availability.mode,
      ...(lastSyncedAt ? { lastSyncedAt } : {}),
      lastError,
    },
  });

  await createAuditLog({
    organizationId: patient.organizationId,
    actorId: patient.userId,
    targetId: patient.id,
    action: "patient.device_connected",
    metadata: { provider, mode: availability.mode, recordsSynced },
  });

  revalidatePath("/portal/integrations");
  return { ok: true, state: toState(row), recordsSynced };
}

/**
 * Disconnects a device and clears its stored credentials. For a live Garmin
 * connection we also best-effort deregister with Garmin so they stop pushing
 * the patient's data to our webhook.
 */
export async function disconnectDevice(
  provider: string,
): Promise<DeviceActionResult> {
  if (!isDeviceProvider(provider)) return { ok: false, error: "Unknown device." };
  const patient = await requirePatient();

  if (provider === "garmin") {
    const existing = await prisma.deviceConnection.findUnique({
      where: { patientId_provider: { patientId: patient.id, provider } },
    });
    if (existing?.mode === "live") {
      const token = loadLiveToken(existing);
      if (token) await garminHealthClient.deregister(token);
    }
  }

  const row = await prisma.deviceConnection.upsert({
    where: { patientId_provider: { patientId: patient.id, provider } },
    create: { patientId: patient.id, provider, connected: false },
    update: {
      connected: false,
      accessToken: null,
      accessTokenSecret: null,
      providerUserId: null,
      oauthState: null,
      lastError: null,
    },
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
 * biometrics (live) or re-simulates (mock); other providers have no sync.
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
  if (provider !== "garmin") {
    return { ok: false, error: "This integration doesn't support manual sync yet." };
  }

  let recordsSynced = 0;
  let lastError: string | null = null;

  try {
    recordsSynced = await syncGarminConnection({
      patientId: patient.id,
      accessToken: existing.accessToken,
      accessTokenSecret: existing.accessTokenSecret,
    });
  } catch (err) {
    console.error("[Garmin] manual sync failed:", err);
    lastError = syncErrorMessage(err);
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
