/**
 * Garmin integration mode + guardrail (EMR-054).
 *
 * SAFETY RATIONALE
 * ----------------
 * The #678 ship minted a literal `mock-garmin-token` and wrote fabricated
 * biometrics (HR 65, stress 42, sleep 85, …) straight into the patient's
 * clinical OutcomeLog AND fed them through the CDS engine, which can spawn
 * care-team tasks/alerts. In an EMR that is a data-integrity and
 * patient-safety hazard, not just a missing feature.
 *
 * This module is the SINGLE gate that decides whether the Garmin path may
 * run at all, and in which mode:
 *
 *   - "live"     Real Garmin Health API. Requires GARMIN_CONSUMER_KEY +
 *                GARMIN_CONSUMER_SECRET. Real OAuth, real data, real charts.
 *   - "mock"     Simulated data for local dev / demos. Requires the explicit
 *                GARMIN_ALLOW_MOCK=true opt-in AND a non-production NODE_ENV.
 *                Every value written is tagged "(SIMULATED)" so it can never
 *                be mistaken for — or exported as — real clinical data.
 *   - "disabled" The default. Connect is refused, the card shows "Coming
 *                soon", nothing can reach a chart.
 *
 * Production with no real credentials => "disabled". The mock can NEVER be
 * reached in production, by construction (see resolveGarminMode).
 */

export type GarminMode = "live" | "mock" | "disabled";

/** True when running under a production build/deploy. */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * The Garmin OAuth 1.0a consumer credentials, or null if either is missing.
 * Presence of BOTH is what flips the integration into "live".
 */
export function garminConsumerCredentials(): {
  key: string;
  secret: string;
} | null {
  const key = process.env.GARMIN_CONSUMER_KEY?.trim();
  const secret = process.env.GARMIN_CONSUMER_SECRET?.trim();
  if (key && secret) return { key, secret };
  return null;
}

/**
 * Resolve the active Garmin mode.
 *
 * Precedence:
 *   1. Real consumer credentials present  -> "live" (even in dev).
 *   2. Explicit non-prod mock opt-in       -> "mock".
 *   3. Otherwise                           -> "disabled".
 *
 * The production guard on the mock branch is the load-bearing safety line:
 * a misconfigured prod deploy without credentials lands on "disabled", so a
 * real patient can never connect into the fabricated-data path.
 */
export function resolveGarminMode(): GarminMode {
  if (garminConsumerCredentials()) return "live";
  if (!isProduction() && process.env.GARMIN_ALLOW_MOCK === "true") return "mock";
  return "disabled";
}

/** Whether a patient may connect Garmin at all right now. */
export function isGarminConnectable(): boolean {
  return resolveGarminMode() !== "disabled";
}

/**
 * Shared secret guarding the inbound webhook. Garmin does not HMAC-sign its
 * Health API pushes, so the recommended guard is a hard-to-guess path/secret
 * (plus IP allowlisting at the edge). When unset, the webhook rejects every
 * request rather than ingesting unauthenticated biometric data.
 */
export function garminWebhookToken(): string | null {
  return process.env.GARMIN_WEBHOOK_TOKEN?.trim() || null;
}

/**
 * Garmin Health API endpoints. Overridable via env so tests (and a future
 * Garmin sandbox tenant) can point at a stub without code changes.
 */
export const GARMIN_ENDPOINTS = {
  requestToken:
    process.env.GARMIN_REQUEST_TOKEN_URL ??
    "https://connectapi.garmin.com/oauth-service/oauth/request_token",
  authorize:
    process.env.GARMIN_AUTHORIZE_URL ??
    "https://connect.garmin.com/oauthConfirm",
  accessToken:
    process.env.GARMIN_ACCESS_TOKEN_URL ??
    "https://connectapi.garmin.com/oauth-service/oauth/access_token",
  apiBase:
    process.env.GARMIN_API_BASE ?? "https://apis.garmin.com/wellness-api/rest",
} as const;

/**
 * Absolute base URL of this app, used to build the OAuth callback URI that we
 * register with Garmin and that Garmin redirects back to. NEXT_PUBLIC_APP_URL
 * is the canonical source (already set in .env.local / render); APP_URL is a
 * server-only fallback.
 */
export function appBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** The OAuth 1.0a callback URL Garmin redirects to after user authorization. */
export function garminCallbackUrl(): string {
  return `${appBaseUrl()}/api/integrations/garmin/callback`;
}
