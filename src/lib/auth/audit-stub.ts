// EMR-470: name retained as 'audit-stub' for import-path stability across the storm. Body is now real persistence.
//
// Every mutation on the Practice Onboarding Controller surface (templates,
// configs, wizard saves, publish/rollback, etc.) MUST call
// `logControllerAction()` so we have a record of who-did-what. Rows land in
// `ControllerAuditLog` (see prisma/schema.prisma). The table is append-only
// at the DB grant + trigger level — see
// `prisma/migrations/20260505120000_add_controller_audit_log/append-only.sql`.
//
// Failure mode: a single insert. If it fails (DB down, schema drift, etc.)
// we `console.error` and resolve — a missing audit row never blocks a
// controller mutation. v1 trades durability for write availability.
//
// TODO(EMR-470 follow-up): wrap the insert in a durable queue so we can
// retry on transient failures without coupling controller latency to audit
// writes.

import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import type { AuthedUser } from "./session";

/**
 * Snapshot of an entity for before/after diffing in the audit trail.
 * Intentionally typed as JSON-ish to avoid coupling to any specific Prisma
 * model — the controller operates over heterogeneous configs/templates.
 */
export type AuditSnapshot = Record<string, unknown> | null | undefined;

export interface ControllerAuditEntry {
  /** The user performing the mutation. Pulled from `requireImplementationAdmin()`. */
  actor: Pick<AuthedUser, "id" | "email" | "roles" | "organizationId">;
  /**
   * Dot-namespaced action. Examples:
   *   - "controller.template.create"
   *   - "controller.config.publish"
   *   - "controller.config.rollback"
   *   - "controller.wizard.step.save"
   */
  action: string;
  /** ID of the object being mutated (template id, config id, practice id, etc.). */
  targetId: string;
  /** Optional snapshot of the entity prior to the mutation. */
  before?: AuditSnapshot;
  /** Optional snapshot of the entity after the mutation. */
  after?: AuditSnapshot;
  /** Optional human-supplied reason — e.g. for rollback or manual override. */
  reason?: string;
}

/**
 * Record a controller mutation to `ControllerAuditLog`.
 *
 * Mapping (kept identical to the stub's prior payload shape so call sites
 * never had to change):
 *   - `actor.id`             → ControllerAuditLog.actorUserId
 *   - `actor.email`          → ControllerAuditLog.actorEmail
 *   - `actor.roles`          → ControllerAuditLog.actorRoles
 *   - `actor.organizationId` → ControllerAuditLog.organizationId
 *   - `action`               → ControllerAuditLog.action
 *   - `"controller"`         → ControllerAuditLog.subjectType
 *   - `targetId`             → ControllerAuditLog.subjectId
 *   - `before` / `after`     → ControllerAuditLog.before / .after (Json)
 *   - `reason`               → ControllerAuditLog.reason
 */
/**
 * Sleep `ms` milliseconds. Inlined to avoid pulling in a util module from
 * a path that's already deep in the auth boundary.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Number of times we'll retry the audit insert before giving up. Three
 * matches typical transient-fault tolerance for connection-pool exhaustion
 * and brief Postgres restart windows on Render.
 */
const AUDIT_MAX_ATTEMPTS = 3;

/**
 * Base delay between attempts, in ms. The backoff is exponential
 * (BASE * 2^attempt), so attempts land at ~50, ~100, ~200 ms.
 * Total worst-case added latency is ~350ms — acceptable for an audit row
 * the controller surface already awaits.
 */
const AUDIT_BACKOFF_BASE_MS = 50;

/**
 * Send a final-failure context to Sentry if it's loaded. Imported lazily
 * via `require` so this module remains testable in environments where
 * @sentry/nextjs isn't initialized (vitest, scripts/, etc.).
 */
function captureAuditFailure(payload: Record<string, unknown>): void {
  try {
    const Sentry = require("@sentry/nextjs") as {
      captureMessage?: (
        message: string,
        context?: { level?: string; extra?: Record<string, unknown> },
      ) => void;
    };
    Sentry.captureMessage?.("audit:controller:persist_failed", {
      level: "error",
      extra: payload,
    });
  } catch {
    // Sentry not loaded — fall through to the console fallback.
  }
}

export async function logControllerAction(entry: ControllerAuditEntry): Promise<void> {
  // Json columns: Prisma's `JsonNull` is the in-DB JSON null; `DbNull`
  // leaves the column SQL NULL. We use SQL NULL when the caller didn't
  // supply a snapshot — keeps the column index-friendly and matches the
  // "absent" semantics callers expect.
  const before: Prisma.InputJsonValue | typeof Prisma.DbNull =
    entry.before == null ? Prisma.DbNull : (entry.before as Prisma.InputJsonValue);
  const after: Prisma.InputJsonValue | typeof Prisma.DbNull =
    entry.after == null ? Prisma.DbNull : (entry.after as Prisma.InputJsonValue);

  const data = {
    actorUserId: entry.actor.id,
    actorEmail: entry.actor.email ?? null,
    actorRoles: entry.actor.roles ?? [],
    organizationId: entry.actor.organizationId ?? null,
    action: entry.action,
    subjectType: "controller" as const,
    subjectId: entry.targetId,
    before,
    after,
    reason: entry.reason ?? null,
  };

  // Retry the insert with exponential backoff. The append-only audit table
  // is the system of record for who-did-what; transient connection-pool
  // exhaustion or Postgres restarts shouldn't cost us a row.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < AUDIT_MAX_ATTEMPTS; attempt++) {
    try {
      await prisma.controllerAuditLog.create({ data });
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < AUDIT_MAX_ATTEMPTS - 1) {
        await sleep(AUDIT_BACKOFF_BASE_MS * 2 ** attempt);
      }
    }
  }

  // All attempts failed. Capture to Sentry (best effort) AND emit a
  // structured console line so log-aggregator alerts can fire on the
  // tag. Compliance posture: we still don't block the controller mutation
  // on durable audit (v1 trade-off documented in the module header) — but
  // we now have an out-of-band signal that ops can reconcile from.
  const fallback = {
    at: new Date().toISOString(),
    attempts: AUDIT_MAX_ATTEMPTS,
    actorUserId: entry.actor.id,
    actorEmail: entry.actor.email ?? null,
    actorRoles: entry.actor.roles ?? [],
    organizationId: entry.actor.organizationId ?? null,
    action: entry.action,
    subjectType: "controller",
    subjectId: entry.targetId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
    error: lastErr instanceof Error ? lastErr.message : String(lastErr),
  };
  captureAuditFailure(fallback);
  logger.error({ event: "audit.controller.persist_failed", ...fallback });
}
