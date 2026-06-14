/**
 * Mobile biometrics ingestion config (Apple Health / Android Health Connect).
 *
 * Apple HealthKit and Android Health Connect are ON-DEVICE stores with no
 * cloud OAuth API — there is no server-side "Connect" handshake. Data reaches
 * us only when the LeafJourney mobile app reads the on-device store (with the
 * user's in-app permission) and POSTs it to /api/mobile/biometrics/sync.
 *
 * That endpoint is gated on a shared bearer token: configured => the mobile
 * path is live and the Apple/Android cards show "Set up in the app";
 * unconfigured => the endpoint fails closed and the cards read "Coming soon".
 */

export function mobileBiometricsToken(): string | null {
  return process.env.MOBILE_BIOMETRICS_TOKEN?.trim() || null;
}

export function mobileBiometricsEnabled(): boolean {
  return mobileBiometricsToken() !== null;
}

/** Provider slugs whose data arrives via the mobile app (not web OAuth). */
export const MOBILE_PROVIDERS = ["apple-health", "android"] as const;
export type MobileProvider = (typeof MOBILE_PROVIDERS)[number];

export function isMobileProvider(slug: string): slug is MobileProvider {
  return (MOBILE_PROVIDERS as readonly string[]).includes(slug);
}
