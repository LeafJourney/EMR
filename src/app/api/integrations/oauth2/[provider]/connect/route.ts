// Generic OAuth 2.0 connect — step 1: mint a CSRF state, stash it (encrypted)
// on the patient's DeviceConnection, and bounce the browser to the provider's
// consent screen. Handles every OAuth2 cloud provider in the registry
// (Oura, Whoop, …). Garmin (OAuth 1.0a) has its own routes.

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getOAuth2Module } from "@/lib/integrations/providers/registry";
import { buildAuthorizeUrl } from "@/lib/integrations/oauth2";
import {
  appBaseUrl,
  oauth2CallbackUrl,
  randomOAuthState,
} from "@/lib/integrations/base-url";
import { encryptToken } from "@/lib/integrations/token-crypto";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { provider: string } },
) {
  const { provider } = params;
  const integrations = `${appBaseUrl()}/portal/integrations`;

  const mod = getOAuth2Module(provider);
  const cfg = mod?.config() ?? null;
  if (!mod || !cfg) {
    return NextResponse.redirect(`${integrations}?integration=${provider}&status=unavailable`);
  }

  try {
    const user = await requireRole("patient");
    const patient = await prisma.patient.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!patient) {
      return NextResponse.redirect(`${integrations}?integration=${provider}&status=error`);
    }

    const state = randomOAuthState();
    await prisma.deviceConnection.upsert({
      where: { patientId_provider: { patientId: patient.id, provider } },
      create: {
        patientId: patient.id,
        provider,
        connected: false,
        mode: "live",
        oauthState: encryptToken(state),
      },
      update: { mode: "live", oauthState: encryptToken(state), lastError: null },
    });

    const url = buildAuthorizeUrl(cfg, {
      redirectUri: oauth2CallbackUrl(provider),
      state,
    });
    return NextResponse.redirect(url);
  } catch (err) {
    console.error(`[${provider}] connect initiation failed:`, err);
    return NextResponse.redirect(`${integrations}?integration=${provider}&status=error`);
  }
}
