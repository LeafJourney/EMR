/**
 * Wearable provider registry — the single source of truth for "what can this
 * provider do right now", spanning all three integration kinds:
 *
 *   - OAuth 1.0a  -> Garmin (its own module/config).
 *   - OAuth 2.0   -> Oura, Whoop (this directory).
 *   - mobile app  -> Apple Health, Android Health Connect (on-device; no web
 *                    OAuth, data arrives via /api/mobile/biometrics/sync).
 *
 * `providerRuntime()` drives the portal Integrations page (server-side) so a
 * "Connect" button only appears when there's a real backend behind it.
 */

import { resolveGarminMode } from "../garmin/config";
import { mobileBiometricsEnabled, isMobileProvider } from "../mobile/config";
import { ouraModule } from "./oura";
import { whoopModule } from "./whoop";
import type { OAuth2ProviderModule, ProviderRuntime } from "./types";

const OAUTH2_MODULES: Record<string, OAuth2ProviderModule> = {
  oura: ouraModule,
  whoop: whoopModule,
};

export function getOAuth2Module(slug: string): OAuth2ProviderModule | null {
  return OAUTH2_MODULES[slug] ?? null;
}

export function listOAuth2Modules(): OAuth2ProviderModule[] {
  return Object.values(OAUTH2_MODULES);
}

const UNAVAILABLE = (
  reason: ProviderRuntime["reason"],
): ProviderRuntime => ({ available: false, mode: null, connectKind: null, reason });

export function providerRuntime(slug: string): ProviderRuntime {
  // Garmin (OAuth 1.0a) — delegate to its dedicated mode resolver.
  if (slug === "garmin") {
    const mode = resolveGarminMode();
    if (mode === "disabled") return UNAVAILABLE("not_configured");
    return {
      available: true,
      mode,
      connectKind: mode === "live" ? "oauth-redirect" : "inline",
    };
  }

  // OAuth 2.0 cloud providers (Oura, Whoop).
  const mod = OAUTH2_MODULES[slug];
  if (mod) {
    return mod.config()
      ? { available: true, mode: "live", connectKind: "oauth-redirect" }
      : UNAVAILABLE("not_configured");
  }

  // Mobile-only providers (Apple Health, Android Health Connect).
  if (isMobileProvider(slug)) {
    return mobileBiometricsEnabled()
      ? { available: true, mode: "mobile", connectKind: "mobile-app" }
      : UNAVAILABLE("mobile_only");
  }

  // No real backend yet (Fitbit, Dexcom, Libre, Medtronic, Eversense).
  return UNAVAILABLE("not_implemented");
}
