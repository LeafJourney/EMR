// Generic OAuth 2.0 callback — step 2: validate the CSRF state (session-bound),
// exchange the code for tokens, store them ENCRYPTED, capture the provider
// user id for webhook routing, and kick off an initial pull. Handles every
// OAuth2 cloud provider in the registry (Oura, Whoop, …).

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/domain/audit-logger";
import { getOAuth2Module } from "@/lib/integrations/providers/registry";
import { exchangeCode } from "@/lib/integrations/oauth2";
import { syncOAuth2Connection } from "@/lib/integrations/providers/sync";
import { appBaseUrl, oauth2CallbackUrl } from "@/lib/integrations/base-url";
import { encryptToken, decryptTokenSafe } from "@/lib/integrations/token-crypto";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: { provider: string } },
) {
  const { provider } = params;
  const integrations = `${appBaseUrl()}/portal/integrations`;
  const done = (status: string) =>
    NextResponse.redirect(`${integrations}?integration=${provider}&status=${status}`);

  const mod = getOAuth2Module(provider);
  const cfg = mod?.config() ?? null;
  if (!mod || !cfg) return done("unavailable");

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (url.searchParams.get("error") || !code || !state) return done("error");

    const user = await requireRole("patient");
    const patient = await prisma.patient.findUnique({
      where: { userId: user.id },
      select: { id: true, organizationId: true },
    });
    if (!patient) return done("error");

    const conn = await prisma.deviceConnection.findUnique({
      where: { patientId_provider: { patientId: patient.id, provider } },
    });
    // CSRF: the state echoed back must match what we stored for this session.
    if (!conn?.oauthState || decryptTokenSafe(conn.oauthState) !== state) {
      return done("error");
    }

    const tokens = await exchangeCode(cfg, {
      code,
      redirectUri: oauth2CallbackUrl(provider),
    });

    let providerUserId: string | null = null;
    try {
      providerUserId = await mod.fetchUserId(tokens.accessToken);
    } catch (err) {
      console.error(`[${provider}] fetchUserId failed (continuing):`, err);
    }

    const encAccess = encryptToken(tokens.accessToken);
    const encRefresh = tokens.refreshToken ? encryptToken(tokens.refreshToken) : null;

    await prisma.deviceConnection.update({
      where: { patientId_provider: { patientId: patient.id, provider } },
      data: {
        connected: true,
        mode: "live",
        accessToken: encAccess,
        accessTokenSecret: encRefresh,
        tokenExpiresAt: tokens.expiresAt,
        providerUserId,
        scopes: mod.scopesForStorage,
        oauthState: null,
        lastError: null,
      },
    });

    await createAuditLog({
      organizationId: patient.organizationId,
      actorId: user.id,
      targetId: patient.id,
      action: "patient.device_connected",
      metadata: { provider, mode: "live", via: "oauth2" },
    });

    // Initial pull (best-effort — the connection already succeeded).
    try {
      await syncOAuth2Connection(mod, {
        patientId: patient.id,
        provider,
        accessToken: encAccess,
        accessTokenSecret: encRefresh,
        tokenExpiresAt: tokens.expiresAt,
      });
    } catch (err) {
      console.error(`[${provider}] initial pull after connect failed:`, err);
    }

    return done("connected");
  } catch (err) {
    console.error(`[${provider}] callback failed:`, err);
    return done("error");
  }
}
