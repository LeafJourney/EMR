// Server-only provider availability for the patient Integrations page.
//
// "Available" means a patient can actually connect the provider right now and
// have it do something real. Every card previously rendered a working
// "Connect" regardless of whether a backend existed. Honesty rule (Dr. Patel
// data-honesty directive): a provider is only "available" if it has a real
// flow behind it — resolved by the wearable provider registry, which spans
// Garmin (OAuth1), Oura/Whoop (OAuth2), and Apple/Android (mobile app).
//
// Reads env (registry), so server-only — the page passes the computed map
// down to the client view as a plain prop.

import { DEVICE_PROVIDERS, type DeviceProvider, type ProviderAvailability } from "./providers";
import { providerRuntime } from "@/lib/integrations/providers/registry";

export type { ProviderAvailability };

export function providerAvailability(
  provider: DeviceProvider,
): ProviderAvailability {
  return providerRuntime(provider);
}

export function allProviderAvailability(): Record<string, ProviderAvailability> {
  const out: Record<string, ProviderAvailability> = {};
  for (const provider of DEVICE_PROVIDERS) {
    out[provider] = providerRuntime(provider);
  }
  return out;
}
