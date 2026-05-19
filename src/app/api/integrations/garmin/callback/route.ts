import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
// @ts-ignore - types missing
import OAuth from "oauth-1.0a";
import crypto from "crypto";

export async function GET(req: Request) {
  try {
    const session = await requireRole("patient");
    if (!session) return NextResponse.redirect(new URL("/login", req.url));

    const { searchParams } = new URL(req.url);
    const oauthToken = searchParams.get("oauth_token");
    const oauthVerifier = searchParams.get("oauth_verifier");

    if (!oauthToken || !oauthVerifier) {
      return NextResponse.json({ error: "Missing OAuth parameters" }, { status: 400 });
    }

    const consumerKey = process.env.GARMIN_CONSUMER_KEY || "mock-key";
    const consumerSecret = process.env.GARMIN_CONSUMER_SECRET || "mock-secret";

    const oauth = new OAuth({
      consumer: { key: consumerKey, secret: consumerSecret },
      signature_method: "HMAC-SHA1",
      hash_function(base_string, key) {
        return crypto.createHmac("sha1", key).update(base_string).digest("base64");
      },
    });

    // In a real implementation, we would make a POST to https://connectapi.garmin.com/oauth-service/oauth/access_token
    // passing the oauthToken, the temporary secret (retrieved from cache), and the oauthVerifier to get the final tokens.

    const finalAccessToken = "garmin_access_" + Date.now();
    const finalAccessSecret = "garmin_secret_" + Date.now();

    // Upsert the IntegrationConnection
    await prisma.integrationConnection.upsert({
      where: {
        patientId_provider: {
          patientId: session.id,
          provider: "garmin"
        }
      },
      update: {
        accessToken: finalAccessToken,
        accessSecret: finalAccessSecret,
        connectedAt: new Date()
      },
      create: {
        patientId: session.id,
        provider: "garmin",
        accessToken: finalAccessToken,
        accessSecret: finalAccessSecret
      }
    });

    // Redirect the user back to the Integrations page
    return NextResponse.redirect(new URL("/portal/integrations", req.url));
  } catch (error) {
    console.error("Garmin Auth Callback Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
