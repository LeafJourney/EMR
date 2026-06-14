// Generic OAuth2-provider webhook (Oura, Whoop). Both are notification-style:
// the event tells us "new data is available for user X", and we re-pull that
// user's recent window via the registry's sync path (the data itself isn't in
// the event). Verification is per-provider:
//
//   - Whoop  HMAC-SHA256 over `${timestamp}${rawBody}` with WHOOP_CLIENT_SECRET,
//            compared to the X-WHOOP-Signature header.
//   - Oura   shared secret in the `?token=` query (OURA_WEBHOOK_TOKEN); the
//            GET subscription-verification handshake echoes the challenge.
//
// We always 200 a verified event so the provider doesn't retry the batch.

import { createHmac, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getOAuth2Module } from "@/lib/integrations/providers/registry";
import { syncOAuth2Connection } from "@/lib/integrations/providers/sync";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function verifyWhoop(rawBody: string, headers: Headers): boolean {
  const secret = process.env.WHOOP_CLIENT_SECRET?.trim();
  const signature = headers.get("x-whoop-signature");
  const timestamp = headers.get("x-whoop-signature-timestamp");
  if (!secret || !signature || !timestamp) return false;
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}${rawBody}`)
    .digest("base64");
  return safeEqual(expected, signature);
}

// Oura subscription verification handshake: GET with verification_token +
// challenge; echo the challenge if the token matches.
export async function GET(
  req: Request,
  { params }: { params: { provider: string } },
) {
  if (params.provider !== "oura") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const token = url.searchParams.get("verification_token");
  const challenge = url.searchParams.get("challenge");
  const expected = process.env.OURA_WEBHOOK_TOKEN?.trim();
  if (!expected || !token || !safeEqual(token, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ challenge });
}

export async function POST(
  req: Request,
  { params }: { params: { provider: string } },
) {
  const { provider } = params;
  const mod = getOAuth2Module(provider);
  if (!mod || !mod.config()) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const rawBody = await req.text();

  // Authenticate the event.
  if (provider === "whoop") {
    if (!verifyWhoop(rawBody, req.headers)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  } else if (provider === "oura") {
    const expected = process.env.OURA_WEBHOOK_TOKEN?.trim();
    const provided = new URL(req.url).searchParams.get("token") ?? "";
    if (!expected || !safeEqual(provided, expected)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const userId = body.user_id != null ? String(body.user_id) : null;
  if (!userId) return NextResponse.json({ received: true, ingested: 0 });

  const conn = await prisma.deviceConnection.findFirst({
    where: { provider, providerUserId: userId, connected: true },
    select: {
      patientId: true,
      accessToken: true,
      accessTokenSecret: true,
      tokenExpiresAt: true,
    },
  });
  if (!conn) return NextResponse.json({ received: true, ingested: 0 });

  let ingested = 0;
  try {
    ingested = await syncOAuth2Connection(mod, {
      patientId: conn.patientId,
      provider,
      accessToken: conn.accessToken,
      accessTokenSecret: conn.accessTokenSecret,
      tokenExpiresAt: conn.tokenExpiresAt,
    });
  } catch (err) {
    console.error(`[${provider}] webhook re-pull failed for user ${userId}:`, err);
  }

  return NextResponse.json({ received: true, ingested });
}
