/**
 * active-banners.ts — pure, server- AND client-safe resolver for the set of
 * active system banners. NO "use client" directive: this must be importable
 * from server components (e.g. the /admin/banners viewer) and server actions.
 *
 * The React hook wrapper lives in ./system-banner-source ("use client") and
 * delegates to getActiveSystemBanners here. Keeping the filter logic in this
 * server-safe module is what lets a Server Component call it directly — a
 * Server Component calling a function exported from a "use client" module gets
 * a client-reference proxy and throws at request time (that was the
 * /admin/banners 500).
 */

import { SYSTEM_BANNERS, type SystemBannerConfig } from "./config";

export type ActiveBannerSurface = "clinician" | "operator" | "super-admin";

export interface ActiveSystemBannersOptions {
  /** Which mount surface is asking. Used to gate `surfaces` allowlists. */
  surface: ActiveBannerSurface;
  /** Optional clock override for testing. Defaults to `Date.now()`. */
  now?: number;
}

function isWithinWindow(b: SystemBannerConfig, now: number): boolean {
  if (b.startsAt) {
    const start = Date.parse(b.startsAt);
    if (Number.isFinite(start) && now < start) return false;
  }
  if (b.endsAt) {
    const end = Date.parse(b.endsAt);
    if (Number.isFinite(end) && now > end) return false;
  }
  return true;
}

function matchesSurface(b: SystemBannerConfig, surface: ActiveBannerSurface): boolean {
  if (!b.surfaces || b.surfaces.length === 0) return true;
  return b.surfaces.includes(surface);
}

/**
 * Returns the banners that should render right now for `surface`.
 * Pure — safe to call from server or client.
 */
export function getActiveSystemBanners(
  options: ActiveSystemBannersOptions,
): readonly SystemBannerConfig[] {
  const ts = options.now ?? Date.now();
  return SYSTEM_BANNERS.filter(
    (b) => b.enabled && matchesSurface(b, options.surface) && isWithinWindow(b, ts),
  );
}
