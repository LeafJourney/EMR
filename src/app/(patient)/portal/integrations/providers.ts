// Shared, non-server constants/types for the patient portal Integrations
// page. Kept out of actions.ts because a "use server" module may only
// export async functions.

/** Provider slugs that match the Integrations UI card ids. */
export const DEVICE_PROVIDERS = [
  "apple-health",
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

export type DeviceActionResult =
  | { ok: true; state: DeviceConnectionState; recordsSynced?: number }
  | { ok: false; error: string };
