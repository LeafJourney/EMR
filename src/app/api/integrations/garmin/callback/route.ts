// Garmin OAuth 1.0a — step 3/4: Garmin redirects here with the authorized
// request token + verifier. We complete the exchange (session-bound, so the
// patient is authenticated and we don't need patientId in the URL), store the
// long-lived access token + secret ENCRYPTED, capture the Garmin user id used
// to route webhook pushes, then kick off an initial pull + a backfill request.

import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/domain/audit-logger";
import {
  resolveGarminMode,
  appBaseUrl,
} from "@/lib/integrations/garmin/config";
import { exchangeAccessToken } from "@/lib/integrations/garmin/oauth";
import { garminHealthClient } from "@/lib/integrations/garmin/client";
import {
  syncGarminConnection,
  GARMIN_BACKFILL_DAYS,
} from "@/lib/integrations/garmin/sync";
import { encryptToken, decryptToken } from "@/lib/integrations/token-crypto";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const integrations = `${appBaseUrl()}/portal/integrations`;

  if (resolveGarminMode() !== "live") {
    return NextResponse.redirect(`${integrations}?garmin=unavailable`);
  }

  try {
    const url = new URL(req.url);
    const oauthToken = url.searchParams.get("oauth_token");
    const verifier = url.searchParams.get("oauth_verifier");
    if (!oauthToken || !verifier) {
      return NextResponse.redirect(`${integrations}?garmin=error`);
    }

    const user = await requireRole("patient");
    const patient = await prisma.patient.findUnique({
      where: { userId: user.id },
      select: { id: true, organizationId: true },
    });
    if (!patient) {
      return NextResponse.redirect(`${integrations}?garmin=error`);
    }

    const conn = await prisma.deviceConnection.findUnique({
      where: {
        patientId_provider: { patientId: patient.id, provider: "garmin" },
      },
    });
    if (!conn?.oauthState) {
      return NextResponse.redirect(`${integrations}?garmin=error`);
    }

    let state: { requestToken: string; requestTokenSecret: string };
    try {
      state = JSON.parse(decryptToken(conn.oauthState));
    } catch {
      return NextResponse.redirect(`${integrations}?garmin=error`);
    }

    // CSRF / mismatch guard: the token Garmin sends back must be the one we
    // minted for this patient's session.
    if (state.requestToken !== oauthToken) {
      return NextResponse.redirect(`${integrations}?garmin=error`);
    }

    const access = await exchangeAccessToken({
      requestToken: state.requestToken,
      requestTokenSecret: state.requestTokenSecret,
      verifier,
    });

    // Best-effort: capture Garmin's user id for webhook routing.
    let providerUserId: string | null = null;
    try {
      providerUserId = await garminHealthClient.fetchUserId(access);
    } catch (err) {
      console.error("[Garmin] fetchUserId failed (continuing):", err);
    }

    const encAccess = encryptToken(access.token);
    const encSecret = encryptToken(access.tokenSecret);

    await prisma.deviceConnection.update({
      where: {
        patientId_provider: { patientId: patient.id, provider: "garmin" },
      },
      data: {
        connected: true,
        mode: "live",
        accessToken: encAccess,
        accessTokenSecret: encSecret,
        providerUserId,
        scopes: "HEALTH_EXPORT",
        oauthState: null,
        lastError: null,
      },
    });

    await createAuditLog({
      organizationId: patient.organizationId,
      actorId: user.id,
      targetId: patient.id,
      action: "patient.device_connected",
      metadata: { provider: "garmin", mode: "live", via: "oauth" },
    });

    // Initial synchronous pull so the chart isn't empty right after connect,
    // plus a backfill request so Garmin (re)pushes history to our webhook.
    // Both are best-effort: the connection itself already succeeded.
    try {
      await syncGarminConnection({
        patientId: patient.id,
        accessToken: encAccess,
        accessTokenSecret: encSecret,
      });
    } catch (err) {
      console.error("[Garmin] initial pull after connect failed:", err);
    }
    try {
      const end = new Date();
      const start = new Date(end.getTime() - GARMIN_BACKFILL_DAYS * 86_400_000);
      await garminHealthClient.requestBackfill(
        access,
        start.toISOString().split("T")[0],
        end.toISOString().split("T")[0],
      );
    } catch (err) {
      console.error("[Garmin] backfill request failed:", err);
    }

    return NextResponse.redirect(`${integrations}?garmin=connected`);
  } catch (err) {
    console.error("[Garmin] callback failed:", err);
    return NextResponse.redirect(`${integrations}?garmin=error`);
  }
}
