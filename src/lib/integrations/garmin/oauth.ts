/**
 * Garmin Health API — OAuth 1.0a three-legged flow + request signing.
 *
 * Garmin's Health/Wellness API authenticates with OAuth 1.0a (HMAC-SHA1),
 * which is why `oauth-1.0a` is a dependency. The flow:
 *
 *   1. fetchRequestToken(callbackUrl)  -> { token, tokenSecret }
 *   2. buildAuthorizeUrl(token, cb)    -> send the patient's browser here
 *   3. (patient approves; Garmin redirects to callback with
 *      oauth_token + oauth_verifier)
 *   4. exchangeAccessToken({...})      -> long-lived { token, tokenSecret }
 *
 * After step 4 we sign every Health API request with the consumer key +
 * the patient's access token via `signedFetch`. Garmin 1.0a access tokens
 * do not expire on a timer — they live until the user (or we) revoke them —
 * so "refresh" here means "detect a 401/403 and require reconnect", handled
 * by callers, not a refresh-token grant.
 *
 * This module never reads tokens from the DB and never decides policy; it is
 * pure protocol. The guardrail lives in ./config (resolveGarminMode).
 */

import { createHmac } from "crypto";
import OAuth from "oauth-1.0a";
import { GARMIN_ENDPOINTS, garminConsumerCredentials } from "./config";

export interface OAuthTokenPair {
  token: string;
  tokenSecret: string;
}

/** Build an oauth-1.0a signer bound to our consumer credentials. */
function createSigner(): OAuth {
  const consumer = garminConsumerCredentials();
  if (!consumer) {
    // Should be unreachable: callers gate on resolveGarminMode() === "live".
    throw new Error(
      "Garmin OAuth requested without GARMIN_CONSUMER_KEY/SECRET configured",
    );
  }
  return new OAuth({
    consumer: { key: consumer.key, secret: consumer.secret },
    signature_method: "HMAC-SHA1",
    hash_function(baseString, key) {
      return createHmac("sha1", key).update(baseString).digest("base64");
    },
  });
}

/**
 * Produce the `Authorization: OAuth ...` header for a request.
 *
 * - `queryData` are non-oauth request params (e.g. the wellness-api time
 *   window). They MUST be in the signature base string but never appear in
 *   the header (toHeader emits only oauth_* keys).
 * - `oauthExtras` are protocol params like oauth_callback / oauth_verifier.
 *   They belong in BOTH the base string and the header, so we re-inject them
 *   onto the authorize result before serialising.
 */
function authHeader(
  method: string,
  url: string,
  opts: {
    token?: OAuthTokenPair;
    queryData?: Record<string, string>;
    oauthExtras?: Record<string, string>;
  } = {},
): string {
  const oauth = createSigner();
  const data = { ...(opts.queryData ?? {}), ...(opts.oauthExtras ?? {}) };
  const token = opts.token
    ? { key: opts.token.token, secret: opts.token.tokenSecret }
    : undefined;
  const authorized = oauth.authorize({ url, method, data }, token);
  const withExtras = authorized as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(opts.oauthExtras ?? {})) {
    withExtras[k] = v;
  }
  return oauth.toHeader(authorized).Authorization;
}

function parseTokenResponse(body: string): OAuthTokenPair {
  const params = new URLSearchParams(body);
  const token = params.get("oauth_token");
  const tokenSecret = params.get("oauth_token_secret");
  if (!token || !tokenSecret) {
    throw new Error(
      `Garmin OAuth: malformed token response (missing oauth_token/secret)`,
    );
  }
  return { token, tokenSecret };
}

/**
 * Step 1 — obtain a temporary request token. The returned tokenSecret must be
 * stashed (encrypted) until the callback so we can exchange it for an access
 * token.
 */
export async function fetchRequestToken(
  callbackUrl: string,
): Promise<OAuthTokenPair> {
  const url = GARMIN_ENDPOINTS.requestToken;
  const Authorization = authHeader("POST", url, {
    oauthExtras: { oauth_callback: callbackUrl },
  });
  const res = await fetch(url, { method: "POST", headers: { Authorization } });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `Garmin request_token failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  return parseTokenResponse(body);
}

/** Step 2 — the URL we send the patient's browser to for consent. */
export function buildAuthorizeUrl(
  requestToken: string,
  callbackUrl: string,
): string {
  const u = new URL(GARMIN_ENDPOINTS.authorize);
  u.searchParams.set("oauth_token", requestToken);
  // Garmin honours a per-request callback override here as well as on the
  // request_token call; setting both is belt-and-suspenders.
  u.searchParams.set("oauth_callback", callbackUrl);
  return u.toString();
}

/**
 * Step 4 — exchange the authorized request token + verifier for a long-lived
 * access token + secret.
 */
export async function exchangeAccessToken(args: {
  requestToken: string;
  requestTokenSecret: string;
  verifier: string;
}): Promise<OAuthTokenPair> {
  const url = GARMIN_ENDPOINTS.accessToken;
  const Authorization = authHeader("POST", url, {
    token: { token: args.requestToken, tokenSecret: args.requestTokenSecret },
    oauthExtras: { oauth_verifier: args.verifier },
  });
  const res = await fetch(url, { method: "POST", headers: { Authorization } });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(
      `Garmin access_token failed (${res.status}): ${body.slice(0, 200)}`,
    );
  }
  return parseTokenResponse(body);
}

/**
 * Perform an OAuth 1.0a-signed request against the Garmin Health API.
 * `query` params are folded into both the signature and the request URL.
 */
export async function signedFetch(
  method: "GET" | "POST" | "DELETE",
  url: string,
  token: OAuthTokenPair,
  query: Record<string, string> = {},
): Promise<Response> {
  const target = new URL(url);
  for (const [k, v] of Object.entries(query)) {
    target.searchParams.set(k, v);
  }
  const Authorization = authHeader(method, target.toString(), {
    token,
    queryData: query,
  });
  return fetch(target.toString(), { method, headers: { Authorization } });
}
