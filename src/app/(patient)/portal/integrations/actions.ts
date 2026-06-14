"use server";

// EMR-054 — patient portal device/wearable connections.
//
// Per-patient persistence (DeviceConnection) for the Integrations page, gated
// by the wearable provider registry. A provider is only connectable when it
// has a real backend:
//   - Garmin (OAuth 1.0a)  -> redirect to /api/integrations/garmin/connect
//                             (or an inline simulated ingest in mock mode).
//   - Oura / Whoop (OAuth2)-> redirect to /api/integrations/oauth2/<p>/connect.
//   - Apple / Android      -> connect happens in the mobile app (no web OAuth).
//   - everything else      -> "Coming soon".
//
// Connecting/syncing runs an ingestion pass into OutcomeLog and evaluates the
// wearables CDS rules, mirroring the webhook + cron paths.

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
import { getOAuth2Module } from "@/lib/integrations/providers/registry";
import { syncOAuth2Connection } from "@/lib/integrations/providers/sync";
import { ProviderReconnectError } from "@/lib/integrations/providers/errors";
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
function syncErrorMessage(err: unknown, label: string): string {
  if (err instanceof GarminReconnectError || err instanceof ProviderReconnectError) {
    return `Your ${label} connection expired. Please reconnect ${label}.`;
  }
  return `We couldn't reach ${label}. Please try again.`;
}

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

/** Runs the appropriate ingestion pass for a connected provider row. */
async function syncConnectionRow(
  provider: string,
  row: {
    patientId: string;
    accessToken: string | null;
    accessTokenSecret: string | null;
    tokenExpiresAt: Date | null;
  },
): Promise<number> {
  if (provider === "garmin") {
    return syncGarminConnection({
      patientId: row.patientId,
      accessToken: row.accessToken,
      accessTokenSecret: row.accessTokenSecret,
    });
  }
  const mod = getOAuth2Module(provider);
  if (!mod) throw new Error(`No sync path for provider ${provider}`);
  return syncOAuth2Connection(mod, {
    patientId: row.patientId,
    provider,
    accessToken: row.accessToken,
    accessTokenSecret: row.accessTokenSecret,
    tokenExpiresAt: row.tokenExpiresAt,
  });
}

/**
 * Connects a device. Refuses anything without a real backend; live OAuth
 * providers return a redirect; mobile providers point at the app; mock Garmin
 * runs an inline simulated ingest.
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

  // Live OAuth providers (Garmin 1.0a, Oura/Whoop 2.0).
  if (availability.connectKind === "oauth-redirect") {
    const redirect =
      provider === "garmin"
        ? "/api/integrations/garmin/connect"
        : `/api/integrations/oauth2/${provider}/connect`;
    return { ok: true, redirect };
  }

  // Mobile providers — the connection is established inside the app.
  if (availability.connectKind === "mobile-app") {
    return {
      ok: false,
      error:
        "Open the LeafJourney mobile app and enable health sync to connect this.",
    };
  }

  // Inline path: mock-mode Garmin demo only.
  if (provider !== "garmin") {
    return { ok: false, error: "This integration isn't available to connect yet." };
  }

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
    lastError = syncErrorMessage(err, "Garmin");
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

/** Disconnects a device and clears stored credentials. */
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
      tokenExpiresAt: null,
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

/** Re-runs a sync for an already-connected device (Garmin, Oura, Whoop). */
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
  if (provider !== "garmin" && !getOAuth2Module(provider)) {
    return { ok: false, error: "This integration doesn't support manual sync yet." };
  }

  const label = provider.charAt(0).toUpperCase() + provider.slice(1);
  let recordsSynced = 0;
  let lastError: string | null = null;
  try {
    recordsSynced = await syncConnectionRow(provider, existing);
  } catch (err) {
    console.error(`[${provider}] manual sync failed:`, err);
    lastError = syncErrorMessage(err, label);
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
