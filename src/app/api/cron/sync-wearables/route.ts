// Periodic wearable pull. Previously this wrote MOCK Whoop data (a dummy
// token) into the first 10 patients' charts every run — the same fabricated-
// data hazard the Garmin work fixed. It now syncs only REAL, connected
// DeviceConnections through the guardrailed clients (Garmin OAuth1, Oura/Whoop
// OAuth2). Mock/mobile connections are skipped — mobile data arrives by push,
// and mock data must never reach a real chart from a cron.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { syncGarminConnection } from "@/lib/integrations/garmin/sync";
import { getOAuth2Module } from "@/lib/integrations/providers/registry";
import { syncOAuth2Connection } from "@/lib/integrations/providers/sync";

const PULL_PROVIDERS = ["garmin", "oura", "whoop"];

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Only real, live connections get pulled. Mode "mock"/"mobile" are excluded.
  const connections = await prisma.deviceConnection.findMany({
    where: { connected: true, mode: "live", provider: { in: PULL_PROVIDERS } },
    take: 200,
  });

  let synced = 0;
  let failed = 0;
  for (const conn of connections) {
    try {
      if (conn.provider === "garmin") {
        await syncGarminConnection({
          patientId: conn.patientId,
          accessToken: conn.accessToken,
          accessTokenSecret: conn.accessTokenSecret,
        });
      } else {
        const mod = getOAuth2Module(conn.provider);
        if (!mod) continue;
        await syncOAuth2Connection(mod, {
          patientId: conn.patientId,
          provider: conn.provider,
          accessToken: conn.accessToken,
          accessTokenSecret: conn.accessTokenSecret,
          tokenExpiresAt: conn.tokenExpiresAt,
        });
      }
      synced++;
    } catch (err) {
      failed++;
      console.error(
        `[SyncWearables] ${conn.provider} sync failed for patient ${conn.patientId}:`,
        err,
      );
    }
  }

  return NextResponse.json({ success: true, processed: connections.length, synced, failed });
}
