// Shared, non-server constants/types for the patient portal Integrations
// page. Kept out of actions.ts because a "use server" module may only
// export async functions.

/** Provider slugs that match the Integrations UI card ids. */
export const DEVICE_PROVIDERS = [
  "apple-health",
  "android",
  "fitbit",
  "oura",
  "garmin",
  "dexcom",
  "libre",
  "whoop",
  "medtronic",
  "eversense",
] as const;

export type DeviceProvider = (typeof DEVICE_PROVIDERS)[number];

export function isDeviceProvider(value: string): value is DeviceProvider {
  return (DEVICE_PROVIDERS as readonly string[]).includes(value);
}

export interface DeviceConnectionState {
  connected: boolean;
  lastSync: string | null;
  error: string | null;
}

/**
 * Whether/how a provider can be connected right now. Computed server-side
 * (it reads env) but the shape lives here so the client view can import the
 * type without pulling in the server-only module that produces it.
 */
export interface ProviderAvailability {
  available: boolean;
  mode: "live" | "mock" | "mobile" | null;
  connectKind: "oauth-redirect" | "inline" | "mobile-app" | null;
  reason?: "not_configured" | "not_implemented" | "mobile_only";
}

export type DeviceActionResult =
  | { ok: true; state: DeviceConnectionState; recordsSynced?: number }
  // Live OAuth providers can't connect in a single round-trip — the action
  // hands the client a URL to navigate the browser to (the provider's consent
  // screen) instead of a final state.
  | { ok: true; redirect: string }
  | { ok: false; error: string };
