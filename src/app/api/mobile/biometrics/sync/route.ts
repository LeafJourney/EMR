// EMR-051 — Native Mobile App biometrics ingest (Apple HealthKit / Android
// Health Connect).
//
// Apple Health and Android Health Connect are ON-DEVICE stores with no cloud
// API — the only way their data reaches us is the LeafJourney mobile app
// reading the on-device store (with the user's permission) and POSTing it
// here. This endpoint authenticates the app with a shared bearer token,
// normalizes the payload, writes it idempotently into OutcomeLog (+ HRV
// observations), records the DeviceConnection, and fires CDS.
//
// Fails closed: if MOBILE_BIOMETRICS_TOKEN is unset, nothing can be ingested.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import { createAuditLog } from "@/lib/domain/audit-logger";
import { mobileBiometricsToken } from "@/lib/integrations/mobile/config";
import {
  mapMobile,
  extractHealthKit,
  extractHealthConnect,
  providerForMobileSource,
  mobileObservedBy,
  mobileNotePrefix,
} from "@/lib/integrations/mobile/normalize";
import {
  ingestOutcomeLogs,
  ingestObservations,
  evaluateWearableCDS,
} from "@/lib/integrations/ingest";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = mobileBiometricsToken();
  if (!expected) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ") || authHeader.slice(7).trim() !== expected) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const patientId = typeof body.patientId === "string" ? body.patientId : null;
  const source = typeof body.source === "string" ? body.source : null;
  const provider = source ? providerForMobileSource(source) : null;
  if (!patientId || !provider) {
    return NextResponse.json(
      { error: "Missing or invalid patientId / source" },
      { status: 400 },
    );
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
    select: { id: true, organizationId: true },
  });
  if (!patient) {
    return NextResponse.json({ error: "Unknown patient" }, { status: 404 });
  }

  try {
    const normalized =
      provider === "apple-health"
        ? extractHealthKit(body)
        : extractHealthConnect(body);
    const mapped = mapMobile(patientId, provider, normalized);

    const recordsSynced = await ingestOutcomeLogs(patientId, mapped.logs, {
      prefix: mobileNotePrefix[provider],
    });
    if (mapped.observations?.length) {
      await ingestObservations(patientId, mapped.observations, {
        observedBy: mobileObservedBy[provider],
      });
    }
    await evaluateWearableCDS(patientId);

    await prisma.deviceConnection.upsert({
      where: { patientId_provider: { patientId, provider } },
      create: {
        patientId,
        provider,
        connected: true,
        mode: "mobile",
        lastSyncedAt: new Date(),
      },
      update: { connected: true, mode: "mobile", lastSyncedAt: new Date(), lastError: null },
    });

    await createAuditLog({
      organizationId: patient.organizationId,
      actorId: patientId,
      targetId: patientId,
      action: "patient.device_synced",
      metadata: { provider, source, recordsSynced, via: "mobile" },
    });

    logger.info({ event: "mobile.biometrics.sync", patientId, provider, records: recordsSynced });
    return NextResponse.json({ success: true, provider, recordsSynced });
  } catch (error) {
    logger.error({ event: "mobile.biometrics.failed", patientId, error });
    return NextResponse.json({ error: "Failed to sync biometrics" }, { status: 500 });
  }
}
