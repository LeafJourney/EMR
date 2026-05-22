// EMR-734 — Anomaly detector framework.
//
// Why this exists
// ---------------
// Fleet-ops needs a single substrate for "things HQ should look at" —
// stuck publishes, unhealthy webhooks, stale configs, etc. Each concrete
// detector is a pure function over recent Prisma state that emits zero or
// more `AnomalyEmission` objects. The framework here turns those emissions
// into rows in the `Anomaly` table, with three guarantees:
//
//   1. Re-detection is idempotent. A detector that emits the same
//      `idempotencyKey` on two successive sweeps does NOT create two rows
//      — the second sweep bumps `lastSeenAt` and pushes `expiresAt` out by
//      the freshly-supplied `ttlSeconds`.
//
//   2. Auto-resolve. If a detector previously emitted an idempotencyKey
//      and then STOPS emitting it on a later sweep, the row is marked
//      `resolvedAt = now` (not deleted). The HQ feed filters resolved
//      rows out of the active list, but they remain in the audit trail.
//
//   3. TTL expiry. Rows whose `expiresAt < now` at sweep time are also
//      marked `resolvedAt = now` regardless of detector decision. This
//      catches the case where a detector itself goes silent (bug, deploy)
//      and would otherwise leave stale rows live forever.
//
// Lifecycle states
// ----------------
//   live                  → resolvedAt = null, expiresAt > now
//   resolved-by-detector  → resolvedAt set on the sweep the detector
//                           stopped emitting the key
//   resolved-by-ttl       → resolvedAt set on the sweep that observed
//                           expiresAt < now without re-confirmation
//
// idempotencyKey contract
// -----------------------
// The detector author owns the key shape. The contract is:
//
//   * Same anomaly across sweeps ⇒ same key.
//     e.g. "stuck_publish:configId=cfg_abc" — keyed on the entity that's
//     stuck, not on the timestamp it was first noticed.
//
//   * Different anomaly instances ⇒ different keys. Two distinct
//     publishes both stuck must produce two distinct keys.
//
//   * Uniqueness is scoped to (kind, idempotencyKey) so a detector
//     doesn't have to worry about collisions with other detectors.
//
// PHI scrubbing
// -------------
// The `context` JSON is surfaced verbatim to super-admins via the HQ
// feed. Detectors MUST scrub PHI before emitting — no patient names,
// MRNs, DOBs, free-text clinical notes, etc. Reference ids only.
//
// Testability
// -----------
// `applyEmissions` takes the prisma instance as an argument; the registry
// is the only module-level state. Tests inject a mock prisma client.

import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * A single anomaly the detector wants surfaced. Severity is a 3-level
 * triage hint for the HQ feed:
 *
 *   - "info"     — context only, no immediate operator action.
 *   - "warning"  — fleet-ops should look soon (hours).
 *   - "critical" — fleet-ops should look now (minutes).
 *
 * Wire severities are uppercase in Prisma; we accept lowercase here for
 * detector ergonomics and translate before insert.
 */
export type AnomalySeverity = "info" | "warning" | "critical";

export type AnomalyEmission = {
  /**
   * Stable URL slug for the row. Used as the path segment in deep links
   * on the HQ surface (e.g. /super-admin/anomalies/<slug>). Must be
   * unique across the table — typically the same shape as
   * idempotencyKey but URL-friendly. Detectors are responsible for
   * generating a slug that's both stable across sweeps and unique.
   */
  slug: string;
  /**
   * Detector-author-supplied key. Same anomaly across sweeps = same key.
   * See module header for the contract.
   */
  idempotencyKey: string;
  severity: AnomalySeverity;
  /**
   * Null = fleet-wide anomaly. Otherwise the practice the anomaly
   * targets. Matches the PracticeConfiguration precedent — bare string,
   * no FK.
   */
  practiceId?: string | null;
  message: string;
  /**
   * Absolute or app-relative URL the HQ surface deep-links to so the
   * super-admin can act on the anomaly directly.
   */
  deeplinkUrl: string;
  /**
   * Free-form JSON payload. MUST be PHI-free — see module header.
   */
  context: Record<string, unknown>;
  /**
   * Time-to-live in seconds. The framework computes
   * `expiresAt = now + ttlSeconds` on each upsert.
   */
  ttlSeconds: number;
};

export type AnomalyDetector = {
  /** Stable detector identifier — e.g. "stuck_publish". Stored as `kind`. */
  slug: string;
  run: (prisma: PrismaClient) => Promise<AnomalyEmission[]>;
};

/**
 * Result of applying one detector's emissions. Returned to the sweep so
 * the cron can produce a structured audit row covering the whole run.
 */
export type ApplyEmissionsResult = {
  newOpened: number;
  reaffirmed: number;
  autoResolved: number;
  ttlExpired: number;
};

// ── Detector registry ──────────────────────────────────────
//
// Module-level array. Detectors are registered at import time from the
// concrete detector modules (none in this PR — registry starts empty).
// The sweep cron iterates this array in registration order.

const REGISTRY: AnomalyDetector[] = [];

export function registerDetector(detector: AnomalyDetector): void {
  // Reject duplicate slugs at registration time — collisions silently
  // double-emit otherwise, which would defeat the auto-resolve sweep
  // (each registration's emissions would resolve the other's).
  if (REGISTRY.some((d) => d.slug === detector.slug)) {
    throw new Error(
      `anomaly: detector with slug "${detector.slug}" already registered`,
    );
  }
  REGISTRY.push(detector);
}

export function getRegisteredDetectors(): readonly AnomalyDetector[] {
  return REGISTRY;
}

/**
 * Test-only registry reset. Exposed so unit tests can establish a clean
 * registry per case without leaking state across files. Not exported via
 * any index module — import the symbol directly from "framework.ts".
 */
export function __resetRegistryForTests(): void {
  REGISTRY.length = 0;
}

// ── Severity translation ───────────────────────────────────

const SEVERITY_TO_PRISMA = {
  info: "INFO",
  warning: "WARNING",
  critical: "CRITICAL",
} as const;

// ── applyEmissions ─────────────────────────────────────────

/**
 * Apply one detector's emissions to the `Anomaly` table. The framework
 * runs three passes against this detector's slug only:
 *
 *   1. Upsert every emission by (kind, idempotencyKey). Insert on miss;
 *      on hit, bump `lastSeenAt` and recompute `expiresAt`.
 *
 *   2. Auto-resolve: any live row for THIS detector's slug whose
 *      idempotencyKey is NOT in the current emission batch → mark
 *      `resolvedAt = now`.
 *
 *   3. TTL expiry: any live row for THIS detector's slug whose
 *      `expiresAt < now` (and that we didn't just refresh) → also mark
 *      `resolvedAt = now`. Belt-and-suspenders for the case where the
 *      detector itself fell silent.
 *
 * Cross-detector isolation: we only touch rows whose `kind` matches this
 * detector's slug. Detector A's auto-resolve sweep cannot resolve
 * detector B's live rows.
 */
export async function applyEmissions(
  prisma: PrismaClient,
  detectorSlug: string,
  emissions: AnomalyEmission[],
  now: Date = new Date(),
): Promise<ApplyEmissionsResult> {
  let newOpened = 0;
  let reaffirmed = 0;

  // ── Pass 1: upsert each emission ─────────────────────────
  for (const emission of emissions) {
    const expiresAt = new Date(now.getTime() + emission.ttlSeconds * 1000);
    const severity = SEVERITY_TO_PRISMA[emission.severity];

    // We can't use prisma.anomaly.upsert directly because the unique key
    // is composite (kind, idempotencyKey) AND we need to distinguish
    // create vs. update for the counters. Two-step is fine — the unique
    // index serialises concurrent sweeps at the DB layer.
    const existing = await prisma.anomaly.findUnique({
      where: {
        kind_idempotencyKey: {
          kind: detectorSlug,
          idempotencyKey: emission.idempotencyKey,
        },
      },
      select: { id: true, resolvedAt: true },
    });

    if (existing) {
      // Re-affirm: bump lastSeenAt + expiresAt, clear resolvedAt if a
      // prior sweep resolved this same key and the detector is now
      // re-emitting it (rare but possible — e.g. a flapping condition).
      await prisma.anomaly.update({
        where: { id: existing.id },
        data: {
          lastSeenAt: now,
          expiresAt,
          severity,
          message: emission.message,
          deeplinkUrl: emission.deeplinkUrl,
          context: emission.context as Prisma.InputJsonValue,
          ttlSeconds: emission.ttlSeconds,
          practiceId: emission.practiceId ?? null,
          resolvedAt: null,
        },
      });
      reaffirmed++;
    } else {
      await prisma.anomaly.create({
        data: {
          slug: emission.slug,
          kind: detectorSlug,
          severity,
          practiceId: emission.practiceId ?? null,
          message: emission.message,
          deeplinkUrl: emission.deeplinkUrl,
          context: emission.context as Prisma.InputJsonValue,
          idempotencyKey: emission.idempotencyKey,
          ttlSeconds: emission.ttlSeconds,
          firstSeenAt: now,
          lastSeenAt: now,
          expiresAt,
        },
      });
      newOpened++;
    }
  }

  // ── Pass 2: auto-resolve rows the detector stopped emitting ─
  const emittedKeys = emissions.map((e) => e.idempotencyKey);
  const autoResolve = await prisma.anomaly.updateMany({
    where: {
      kind: detectorSlug,
      resolvedAt: null,
      idempotencyKey: { notIn: emittedKeys.length > 0 ? emittedKeys : [""] },
      // Don't double-count TTL-expired rows in this pass — they're
      // handled in pass 3 with a different counter.
      expiresAt: { gte: now },
    },
    data: { resolvedAt: now },
  });
  const autoResolved = autoResolve.count;

  // ── Pass 3: TTL expiry ──────────────────────────────────
  // Catches rows whose expiresAt is in the past AND the detector didn't
  // re-emit them. (If the detector DID re-emit, pass 1 already pushed
  // expiresAt forward.)
  const ttlExpire = await prisma.anomaly.updateMany({
    where: {
      kind: detectorSlug,
      resolvedAt: null,
      expiresAt: { lt: now },
    },
    data: { resolvedAt: now },
  });
  const ttlExpired = ttlExpire.count;

  return { newOpened, reaffirmed, autoResolved, ttlExpired };
}

// ── listActiveAnomalies ─────────────────────────────────────
//
// Helper for the HQ feed (rendered by a future ticket — see EMR-721 /
// child issues). Returns only rows that are both unresolved AND
// unexpired. Resolved + expired rows are retained for audit but not
// surfaced here.

export type ListActiveAnomaliesFilter = {
  practiceId?: string | null;
  severity?: AnomalySeverity;
};

export async function listActiveAnomalies(
  prisma: PrismaClient,
  filter: ListActiveAnomaliesFilter = {},
  now: Date = new Date(),
) {
  const where: Prisma.AnomalyWhereInput = {
    resolvedAt: null,
    expiresAt: { gte: now },
  };
  if (filter.practiceId !== undefined) {
    // Explicit null = fleet-wide only; explicit string = that practice;
    // omitted = both. This matches the HQ feed's filter UX.
    where.practiceId = filter.practiceId;
  }
  if (filter.severity) {
    where.severity = SEVERITY_TO_PRISMA[filter.severity];
  }
  return prisma.anomaly.findMany({
    where,
    orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
  });
}
