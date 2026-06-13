"use client";

/**
 * system-banner-source.ts — React hook that resolves the set of active system
 * banners for the current surface. Client-only.
 *
 * The pure filter logic lives in ./active-banners (server-safe, no "use
 * client") so Server Components can call getActiveSystemBanners directly. This
 * file is just the `useMemo` hook wrapper for client components.
 *
 * v1 derives strictly from `src/lib/banners/config.ts`. Future swap to
 * `/api/status` (PR #479 follow-up) slots into ./active-banners without
 * touching call sites.
 */

import { useMemo } from "react";
import { type SystemBannerConfig } from "./config";
import {
  getActiveSystemBanners,
  type ActiveBannerSurface,
  type ActiveSystemBannersOptions,
} from "./active-banners";

export type { ActiveBannerSurface };
export type UseActiveSystemBannersOptions = ActiveSystemBannersOptions;

/**
 * Returns the banners that should render right now for `surface`.
 * Stable identity across renders when inputs are unchanged.
 */
export function useActiveSystemBanners({
  surface,
  now,
}: UseActiveSystemBannersOptions): readonly SystemBannerConfig[] {
  return useMemo(() => getActiveSystemBanners({ surface, now }), [surface, now]);
}
