// Garmin OAuth 1.0a — step 1/2: obtain a request token and bounce the
// patient's browser to Garmin's consent screen.
//
// The request-token SECRET is stashed (encrypted) on the patient's
// DeviceConnection so the callback can complete the exchange, and the
// request TOKEN doubles as a CSRF check there. Connecting is impossible
// unless resolveGarminMode() === "live".

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  resolveGarminMode,
  garminCallbackUrl,
  appBaseUrl,
} from "@/lib/integrations/garmin/config";
import {
  fetchRequestToken,
  buildAuthorizeUrl,
} from "@/lib/integrations/garmin/oauth";
import { encryptToken } from "@/lib/integrations/token-crypto";

export const dynamic = "force-dynamic";

export async function GET() {
  const integrations = `${appBaseUrl()}/portal/integrations`;

  // Guardrail: the live OAuth path only exists when configured.
  if (resolveGarminMode() !== "live") {
    return NextResponse.redirect(`${integrations}?garmin=unavailable`);
  }

  try {
    const user = await requireRole("patient");
    const patient = await prisma.patient.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    if (!patient) {
      return NextResponse.redirect(`${integrations}?garmin=error`);
    }

    const callbackUrl = garminCallbackUrl();
    const { token, tokenSecret } = await fetchRequestToken(callbackUrl);

    const oauthState = encryptToken(
      JSON.stringify({ requestToken: token, requestTokenSecret: tokenSecret }),
    );

    await prisma.deviceConnection.upsert({
      where: {
        patientId_provider: { patientId: patient.id, provider: "garmin" },
      },
      create: {
        patientId: patient.id,
        provider: "garmin",
        connected: false,
        mode: "live",
        oauthState,
      },
      update: { mode: "live", oauthState, lastError: null },
    });

    return NextResponse.redirect(buildAuthorizeUrl(token, callbackUrl));
  } catch (err) {
    console.error("[Garmin] connect initiation failed:", err);
    return NextResponse.redirect(`${integrations}?garmin=error`);
  }
}
