"use client";

import { useEffect } from "react";

/**
 * Reports an `error.tsx` boundary error to Sentry exactly once per error
 * instance, even across React StrictMode double-invokes. We key the
 * effect on `error.digest` (set by Next.js for the boundary) and fall
 * back to the message+stack pair when the digest is absent (dev mode).
 *
 * Imported dynamically so the bundle can be tree-shaken in environments
 * where @sentry/nextjs is stubbed out. Failing to load Sentry must NEVER
 * break the error screen itself — that's the user's last good surface.
 */
export function useReportError(error: Error & { digest?: string }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Sentry = await import("@sentry/nextjs");
        if (cancelled) return;
        Sentry.captureException(error, {
          tags: { boundary: "app-error" },
          extra: { digest: error.digest },
        });
      } catch {
        // Sentry not installed / not initialised — log silently and move on.
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[useReportError] Sentry unavailable", error);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error?.digest, error?.message]);
}
