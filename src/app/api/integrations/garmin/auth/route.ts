import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/session";
// @ts-ignore - types missing
import OAuth from "oauth-1.0a";
import crypto from "crypto";

export async function GET() {
  try {
    const session = await requireRole("patient");
    if (!session) return NextResponse.redirect(new URL("/login", "http://localhost:3000"));

    const consumerKey = process.env.GARMIN_CONSUMER_KEY || "mock-key";
    const consumerSecret = process.env.GARMIN_CONSUMER_SECRET || "mock-secret";

    const oauth = new OAuth({
      consumer: { key: consumerKey, secret: consumerSecret },
      signature_method: "HMAC-SHA1",
      hash_function(base_string, key) {
        return crypto.createHmac("sha1", key).update(base_string).digest("base64");
      },
    });

    const requestData = {
      url: "https://connectapi.garmin.com/oauth-service/oauth/request_token",
      method: "POST",
    };

    // In a real implementation, we would make a fetch() to requestData.url with the authorization header
    // to obtain an oauth_token and oauth_token_secret. Then we would store the secret temporarily (e.g. in cookies or a cache)
    // and redirect the user to:
    // https://connect.garmin.com/oauthConfirm?oauth_token=...

    // Since we don't have real keys, we will mock the redirect to our callback directly:
    const mockRequestToken = "mock_request_token_" + session.userId;
    const callbackUrl = new URL(`/api/integrations/garmin/callback?oauth_token=${mockRequestToken}&oauth_verifier=mock_verifier`, process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000");

    return NextResponse.redirect(callbackUrl);
  } catch (error) {
    console.error("Garmin Auth Request Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
