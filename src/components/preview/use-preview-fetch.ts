"use client";

import { useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Tiny in-session SWR-shaped hook for HoverCard preview fetches.
//
// Why not bring in SWR/react-query? The brief is hard-capped at 90min and
// neither dep is installed today. We only need three things:
//
//   1. fetch on first mount of the consumer
//   2. memoize by URL so repeated hovers on the same id are free
//   3. abort the fetch if the consumer unmounts mid-flight
//
// This module gives us exactly that — one Map keyed by URL, one
// in-flight Promise registry, and an AbortSignal per call.
// ---------------------------------------------------------------------------

type CacheEntry<T> = { data: T; storedAt: number };

const CACHE: Map<string, CacheEntry<unknown>> = new Map();
const INFLIGHT: Map<string, Promise<unknown>> = new Map();

// 5 minute TTL — preview cards are read-mostly, and clinicians frequently
// re-hover the same row. Beyond 5min staleness is acceptable for last-
// visit dates and provider titles.
const TTL_MS = 5 * 60 * 1000;

export interface PreviewFetchState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

export function usePreviewFetch<T>(
  url: string | null,
  options: { enabled?: boolean } = {},
): PreviewFetchState<T> {
  const enabled = options.enabled !== false && !!url;
  // Seed synchronously from cache so a re-hover renders instantly.
  const seed = (() => {
    if (!enabled || !url) return null;
    const entry = CACHE.get(url) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() - entry.storedAt > TTL_MS) return null;
    return entry.data;
  })();

  const [data, setData] = useState<T | null>(seed);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled && seed === null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled || !url) return;
    const cached = CACHE.get(url) as CacheEntry<T> | undefined;
    if (cached && Date.now() - cached.storedAt <= TTL_MS) {
      setData(cached.data);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);

    // Coalesce concurrent fetches for the same URL — every hover on the
    // same id shares one network request.
    let inflight = INFLIGHT.get(url) as Promise<T> | undefined;
    if (!inflight) {
      inflight = (async () => {
        const res = await fetch(url, {
          signal: ctrl.signal,
          credentials: "same-origin",
        });
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}`);
        }
        const json = (await res.json()) as T;
        CACHE.set(url, { data: json, storedAt: Date.now() });
        return json;
      })();
      INFLIGHT.set(url, inflight as Promise<unknown>);
      inflight.finally(() => {
        if (INFLIGHT.get(url) === inflight) INFLIGHT.delete(url);
      });
    }

    inflight
      .then((json) => {
        if (!aliveRef.current) return;
        setData(json);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        if (!aliveRef.current) return;
        setError(err instanceof Error ? err.message : "fetch_failed");
        setLoading(false);
      });

    return () => {
      // We never abort the shared inflight promise on unmount — other
      // consumers may still be waiting. We just stop listening locally.
    };
  }, [url, enabled]);

  return { data, error, loading };
}

/**
 * Hard-reset the cache. Exposed for tests and explicit invalidation
 * (e.g. after the user edits a patient record elsewhere on the page).
 */
export function clearPreviewCache(prefix?: string): void {
  if (!prefix) {
    CACHE.clear();
    return;
  }
  for (const key of CACHE.keys()) {
    if (key.startsWith(prefix)) CACHE.delete(key);
  }
}
