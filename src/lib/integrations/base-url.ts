// Shared helpers for integration OAuth redirect/callback URLs.

import { randomBytes } from "crypto";

/** Absolute base URL of this app (for OAuth callbacks Garmin/Oura/Whoop hit). */
export function appBaseUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}

/** OAuth2 callback URL for a given provider slug. */
export function oauth2CallbackUrl(provider: string): string {
  return `${appBaseUrl()}/api/integrations/oauth2/${provider}/callback`;
}

/** A random, URL-safe CSRF state value for an OAuth handshake. */
export function randomOAuthState(): string {
  return randomBytes(16).toString("hex");
}
