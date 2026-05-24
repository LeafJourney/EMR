/**
 * system-health.ts — thin abstraction for the public `/status` page.
 *
 * v1 returns hardcoded "operational" snapshots for every component. The page
 * is intentionally UI-only at this stage so we can iterate on layout and
 * messaging without committing to a probe contract.
 *
 * Follow-up (tracked, not blocking):
 *   - Wire each component to a real probe:
 *       * webApp     -> Render service health endpoint
 *       * api        -> /api/healthz round-trip latency
 *       * database   -> SELECT 1 ping (cached, <1s)
 *       * auth       -> Clerk status feed (https://status.clerk.com)
 *       * email      -> Resend status feed + recent delivery success rate
 *       * payments   -> Payabli webhook receipt lag (last hour)
 *       * jobs       -> queue depth / oldest unacked job age
 *       * storage    -> R2/S3 HEAD on a canary object
 *   - Cache the assembled snapshot for ~30s at the edge so a flood of
 *     /status hits cannot DDoS our own probes.
 *   - Emit each probe result to the observability sink so we can backfill
 *     the 90-day uptime sparkline from real data instead of seeded mock.
 *   - Add an authenticated `/api/status` route that returns the same shape
 *     for the in-app banner (the public page is one consumer of many).
 */

export type ComponentState = "operational" | "degraded" | "outage" | "maintenance";

export type ComponentKey =
  | "webApp"
  | "api"
  | "database"
  | "auth"
  | "email"
  | "payments"
  | "jobs"
  | "storage";

export interface ComponentHealth {
  key: ComponentKey;
  /** Human-readable component label, shown in the grid. */
  name: string;
  /** One-line subtitle clarifying scope. */
  description: string;
  /** Current state, sourced from a probe (mocked in v1). */
  state: ComponentState;
  /** 30-day uptime as a fractional percentage, e.g. 99.98. */
  uptime30: number;
  /** 90-day uptime as a fractional percentage. */
  uptime90: number;
  /**
   * 90 daily uptime samples ordered oldest -> newest. Each value is the
   * day's uptime percentage (0..100). Drives the row sparkline.
   */
  uptimeSeries: number[];
}

export interface SystemHealthSnapshot {
  overall: ComponentState;
  /** ISO timestamp of when this snapshot was assembled. */
  checkedAt: string;
  components: ComponentHealth[];
}

const COMPONENTS: Array<Pick<ComponentHealth, "key" | "name" | "description">> = [
  { key: "webApp", name: "Web app", description: "Patient portal, clinician workspace, operator console" },
  { key: "api", name: "API", description: "REST + tRPC surface area" },
  { key: "database", name: "Database", description: "PostgreSQL primary + read replicas" },
  { key: "auth", name: "Authentication", description: "Clerk-hosted sign-in, sessions, MFA" },
  { key: "email", name: "Email delivery", description: "Transactional email via Resend" },
  { key: "payments", name: "Payments", description: "Payabli gateway + webhooks" },
  { key: "jobs", name: "Background jobs / agents", description: "Worker queue + AI agent fleet" },
  { key: "storage", name: "File storage", description: "Encrypted object storage for PHI attachments" },
];

/**
 * Deterministic pseudo-random uptime series. Seeded by component key so the
 * sparkline is stable across renders without putting Math.random in the
 * render path (would cause hydration mismatches on a server-rendered page).
 *
 * Values stay in the 99.4 - 100 band — anything noisier reads as "we have
 * problems" which is not the v1 story. Replace with real probe history once
 * the observability sink lands.
 */
function seededSeries(key: ComponentKey, days = 90): number[] {
  let seed = 0;
  for (let i = 0; i < key.length; i++) {
    seed = (seed * 31 + key.charCodeAt(i)) >>> 0;
  }
  const out: number[] = [];
  for (let i = 0; i < days; i++) {
    // Simple LCG; values [0, 1).
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const r = (seed >>> 8) / 0xffffff;
    // Bias toward 100; occasional dips to ~99.6.
    const dip = r > 0.92 ? (1 - r) * 4 : 0;
    out.push(Math.max(99.4, Math.min(100, 100 - dip * 0.6)));
  }
  return out;
}

function meanOfLast(series: number[], n: number): number {
  const slice = series.slice(-n);
  if (slice.length === 0) return 100;
  const sum = slice.reduce((a, b) => a + b, 0);
  return Math.round((sum / slice.length) * 100) / 100;
}

/**
 * Returns the current health snapshot. Synchronous in v1 — every value is
 * hardcoded or seeded. Mark async at the call site if you plan to swap in
 * real probes; consumers should already `await` this to make that
 * transition non-breaking.
 */
export async function getSystemHealth(): Promise<SystemHealthSnapshot> {
  const components: ComponentHealth[] = COMPONENTS.map((c) => {
    const uptimeSeries = seededSeries(c.key);
    return {
      ...c,
      state: "operational",
      uptimeSeries,
      uptime30: meanOfLast(uptimeSeries, 30),
      uptime90: meanOfLast(uptimeSeries, 90),
    };
  });

  const overall: ComponentState = components.every((c) => c.state === "operational")
    ? "operational"
    : components.some((c) => c.state === "outage")
      ? "outage"
      : components.some((c) => c.state === "degraded")
        ? "degraded"
        : "maintenance";

  return {
    overall,
    checkedAt: new Date().toISOString(),
    components,
  };
}

export const STATE_COPY: Record<ComponentState, { label: string; pillLabel: string }> = {
  operational: { label: "Operational", pillLabel: "All systems operational" },
  degraded: { label: "Degraded", pillLabel: "Degraded performance" },
  outage: { label: "Outage", pillLabel: "Major outage" },
  maintenance: { label: "Maintenance", pillLabel: "Scheduled maintenance" },
};
