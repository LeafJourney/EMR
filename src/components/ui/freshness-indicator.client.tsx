"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  FreshnessIndicator,
  useStaleRefresh,
  type FreshnessIndicatorProps,
} from "./freshness-indicator";

/**
 * RouterRefreshFreshness — adoption shim for Next.js server components.
 *
 * Server components can't pass a callback prop to a client component, so
 * surfaces that just want "show staleness, on click re-run the page's
 * server data fetch" should drop this in. It wires the click and the
 * visibility-change auto-refresh to `router.refresh()` without forcing the
 * host page to become a client component itself.
 *
 * Pattern:
 *
 *   // server page
 *   const loadedAt = new Date().toISOString();
 *   ...
 *   <RouterRefreshFreshness since={loadedAt} />
 *
 * Pages that already manage their own fetch state should use the bare
 * `<FreshnessIndicator />` directly and pass their own onRefresh.
 */
export function RouterRefreshFreshness(
  props: Omit<FreshnessIndicatorProps, "onRefresh" | "status"> & {
    /** Auto-refresh threshold in ms when the tab regains visibility. */
    visibilityThresholdMs?: number;
    /** Disable the visibility-change auto-refresh entirely. */
    disableAutoRefresh?: boolean;
  },
) {
  const {
    since,
    visibilityThresholdMs = 5 * 60 * 1000,
    disableAutoRefresh = false,
    ...rest
  } = props;
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const refresh = React.useCallback(() => {
    return new Promise<void>((resolve) => {
      startTransition(() => {
        router.refresh();
        // router.refresh resolves via the next render; we don't have a
        // promise hook, so we settle on the next tick. Good enough to
        // toggle the spinner off — the indicator's relative time will
        // freshen as soon as the parent re-renders with a new `since`.
        setTimeout(resolve, 250);
      });
    });
  }, [router]);

  useStaleRefresh({
    since,
    thresholdMs: visibilityThresholdMs,
    onRefresh: refresh,
    enabled: !disableAutoRefresh,
  });

  return (
    <FreshnessIndicator
      since={since}
      onRefresh={refresh}
      status={pending ? "refreshing" : "idle"}
      {...rest}
    />
  );
}

RouterRefreshFreshness.displayName = "RouterRefreshFreshness";
