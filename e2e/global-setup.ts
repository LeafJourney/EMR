// EMR-758 — Pre-flight guard for the local dev server.
//
// During QA-blitz pass 10 the dev server returned HTTP 500 on every public
// route because Next had a stale `.next/cache` reference to a file that
// existed on a different branch (PR #366's IdleTimeoutGuard). The marketplace
// spec failed 8/9 tests purely because the server was serving error pages.
//
// This setup probes `/api/health` once before any test runs. If the response
// is missing, non-200, or body is malformed (e.g. an HTML error page sneaking
// through), we abort the run with a clear, actionable message instead of
// letting the entire spec set silently fail.
//
// The right long-term fix (EMR-758, option 3) is to switch e2e to
// `next build && next start`, where stale-cache cannot occur. This guard is
// the meantime defense.
//
// Skips probing when `BASE_URL` points at a remote environment (CI staging,
// preview deploys) — those have their own health monitoring.

import type { FullConfig } from "@playwright/test";

const DEFAULT_TIMEOUT_MS = 5_000;

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const baseUrl = process.env.BASE_URL || "http://localhost:3000";

  // Only probe when targeting a local dev server. Remote URLs have their own
  // health surface; failing the run before talking to staging would be
  // counterproductive.
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl);
  if (!isLocal) {
    return;
  }

  const healthUrl = baseUrl.replace(/\/$/, "") + "/api/health";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(healthUrl, { signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    throw new Error(
      [
        `[e2e:global-setup] Could not reach ${healthUrl}: ${(err as Error).message}.`,
        "The dev server is not running, or is in a build-error state.",
        "Fix: `rm -rf .next/cache && npm run dev` in a separate terminal, then re-run.",
      ].join("\n"),
    );
  }
  clearTimeout(timer);

  if (response.status !== 200) {
    const snippet = (await response.text()).slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      [
        `[e2e:global-setup] ${healthUrl} returned HTTP ${response.status} — dev server is unhealthy.`,
        `Body (truncated): ${snippet}`,
        "If this references a file that doesn't exist on the current branch, the",
        "`.next/cache` is stale. Fix: `rm -rf .next/cache && npm run dev`, then re-run.",
      ].join("\n"),
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      `[e2e:global-setup] ${healthUrl} returned 200 but non-JSON body — likely an HTML error page leaking through. Restart the dev server.`,
    );
  }

  if (!body || typeof body !== "object" || (body as { ok?: unknown }).ok !== true) {
    throw new Error(
      `[e2e:global-setup] ${healthUrl} responded but ok !== true: ${JSON.stringify(body)}. Investigate dependencies before running e2e.`,
    );
  }
}
