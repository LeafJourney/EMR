// Garmin Health API webhook ingest (push + ping).
//
// Garmin's Health API is push-based: once a patient authorizes us, Garmin
// POSTs summaries (or ping notifications) here. We authenticate the request
// with a shared secret (Garmin does not sign its pushes), map each inbound
// `userId` back to the patient via DeviceConnection.providerUserId, and ingest
// idempotently through the same mapper the synchronous pull uses.
//
// We respond 200 quickly and do the (bounded) ingest inline. A failure for one
// user must not fail the whole delivery, or Garmin will retry the entire batch.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { garminWebhookToken, resolveGarminMode } from "@/lib/integrations/garmin/config";
import {
  parseGarminWebhook,
  type GarminPingEntry,
} from "@/lib/integrations/garmin/webhook";
import {
  parseGarminDaily,
  parseGarminSleep,
} from "@/lib/integrations/garmin/client";
import { signedFetch } from "@/lib/integrations/garmin/oauth";
import { loadLiveToken } from "@/lib/integrations/garmin/sync";
import {
  ingestGarminPayload,
  evaluateGarminCDS,
  type GarminPayload,
} from "@/lib/integrations/garmin-vitals";

export const dynamic = "force-dynamic";

/** Resolve a Garmin userId to a connected patient, or null. */
async function connectionForUser(userId: string) {
  return prisma.deviceConnection.findFirst({
    where: { provider: "garmin", providerUserId: userId, connected: true },
    select: {
      patientId: true,
      accessToken: true,
      accessTokenSecret: true,
    },
  });
}

async function ingestForPatient(
  patientId: string,
  payload: GarminPayload,
): Promise<void> {
  await ingestGarminPayload(patientId, payload, { simulated: false });
  await evaluateGarminCDS(patientId);
}

/** Ping flow: fetch the callbackURL (OAuth-signed) and ingest the result. */
async function handlePing(ping: GarminPingEntry): Promise<void> {
  const conn = await connectionForUser(ping.userId);
  if (!conn) return;
  const token = loadLiveToken(conn);
  if (!token) return;

  const res = await signedFetch("GET", ping.callbackURL, token);
  if (!res.ok) {
    console.error(`[Garmin] ping callback ${res.status} for user ${ping.userId}`);
    return;
  }
  const json = (await res.json().catch(() => [])) as Record<string, unknown>[];
  const rows = Array.isArray(json) ? json : [];

  const payload: GarminPayload =
    ping.summaryType === "dailies"
      ? {
          dailies: rows
            .map(parseGarminDaily)
            .filter((d): d is NonNullable<typeof d> => d !== null),
          sleeps: [],
        }
      : {
          dailies: [],
          sleeps: rows
            .map(parseGarminSleep)
            .filter((s): s is NonNullable<typeof s> => s !== null),
        };

  if (payload.dailies.length === 0 && payload.sleeps.length === 0) return;
  await ingestForPatient(conn.patientId, payload);
}

export async function POST(req: Request) {
  // Auth guard. Garmin doesn't sign pushes, so require our shared secret
  // (query param or header). Unconfigured => reject everything rather than
  // ingest unauthenticated biometric data.
  const expected = garminWebhookToken();
  if (!expected || resolveGarminMode() !== "live") {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("token") ?? req.headers.get("x-webhook-token") ?? "";
  if (provided !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const { pushes, pings } = parseGarminWebhook(body);

  let ingested = 0;
  for (const push of pushes) {
    try {
      const conn = await connectionForUser(push.userId);
      if (!conn) continue;
      await ingestForPatient(conn.patientId, push.payload);
      ingested++;
    } catch (err) {
      console.error(`[Garmin] webhook push ingest failed for ${push.userId}:`, err);
    }
  }
  for (const ping of pings) {
    try {
      await handlePing(ping);
      ingested++;
    } catch (err) {
      console.error(`[Garmin] webhook ping ingest failed for ${ping.userId}:`, err);
    }
  }

  // Always 200 so Garmin doesn't retry the whole batch over one bad user.
  return NextResponse.json({ received: true, ingested });
}
