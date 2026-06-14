// Server-only provider availability for the patient Integrations page.
//
// "Available" means a patient can actually connect the provider right now
// and have it do something real. Every card on the page previously rendered
// a working "Connect" button regardless of whether a backend existed — so
// clicking "Connect Fitbit" marked it Connected with zero real connection,
// and clicking "Connect Garmin" wrote fabricated biometrics into the chart.
//
// Honesty rule (Dr. Patel data-honesty directive): a provider is only
// "available" if it has a real flow behind it. Today that's Garmin alone,
// and only when configured (live) or explicitly opted into mock for a
// non-prod demo. Everything else is "Coming soon" until its flow lands.
//
// This module reads env (resolveGarminMode), so it is server-only and must
// NOT be imported by the client view — the page passes the computed map down
// as a plain prop.

import {
  DEVICE_PROVIDERS,
  type DeviceProvider,
  type ProviderAvailability,
} from "./providers";
import { resolveGarminMode } from "@/lib/integrations/garmin/config";

export type { ProviderAvailability };

const UNAVAILABLE_NOT_IMPLEMENTED: ProviderAvailability = {
  available: false,
  mode: null,
  connectKind: null,
  reason: "not_implemented",
};

export function providerAvailability(
  provider: DeviceProvider,
): ProviderAvailability {
  if (provider === "garmin") {
    const mode = resolveGarminMode();
    if (mode === "disabled") {
      return {
        available: false,
        mode: null,
        connectKind: null,
        reason: "not_configured",
      };
    }
    return {
      available: true,
      mode,
      // Live mode bounces the patient to Garmin's OAuth consent screen; the
      // simulated demo path stays inline (no real provider to redirect to).
      connectKind: mode === "live" ? "oauth-redirect" : "inline",
    };
  }

  // No real backend for the other wearables/CGMs yet.
  return UNAVAILABLE_NOT_IMPLEMENTED;
}

export function allProviderAvailability(): Record<string, ProviderAvailability> {
  const out: Record<string, ProviderAvailability> = {};
  for (const provider of DEVICE_PROVIDERS) {
    out[provider] = providerAvailability(provider);
  }
  return out;
}
