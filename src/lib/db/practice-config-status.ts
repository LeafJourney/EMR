// EMR-436 — PracticeConfiguration status state machine.
//
// The configuration lifecycle is `draft → published → archived`, with a
// `draft → archived` shortcut for discarding a draft. This module is the single
// pure (no-DB) source of truth for which transitions are legal, so both the
// publish/archive route handlers and their unit tests agree on the rules.
//
// Companion invariants enforced at the call site (publish/route.ts), because
// they need a transaction:
//   - At most ONE published config per practice. Publishing demotes any prior
//     published config for the same practice to `archived` in the same tx.
//   - A partial unique index (status = 'published') backstops this at the DB
//     level — see the EMR-436 migration.
//
// Pure module: no `server-only`, no Prisma import. Safe to unit-test under vitest.

export type ConfigStatus = "draft" | "published" | "archived";

/**
 * Legal forward transitions per state. `archived` is terminal — recovering an
 * archived config happens via the rollback action (EMR-472), which creates a
 * NEW draft rather than mutating the archived row back to life.
 */
export const CONFIG_TRANSITIONS: Record<ConfigStatus, readonly ConfigStatus[]> = {
  draft: ["published", "archived"],
  published: ["archived"],
  archived: [],
};

/** Is `from → to` a legal status transition? */
export function canTransition(from: ConfigStatus, to: ConfigStatus): boolean {
  return CONFIG_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * Thrown when an illegal transition is attempted. Route handlers catch this and
 * surface a 409, never a 500 — an out-of-state publish/archive is a client
 * error (e.g. double-submit, stale UI), not a server fault.
 */
export class ConfigTransitionError extends Error {
  readonly from: ConfigStatus;
  readonly to: ConfigStatus;
  constructor(from: ConfigStatus, to: ConfigStatus) {
    super(`INVALID_CONFIG_TRANSITION:${from}->${to}`);
    this.name = "ConfigTransitionError";
    this.from = from;
    this.to = to;
  }
}

/** Assert `from → to` is legal, throwing `ConfigTransitionError` otherwise. */
export function assertConfigTransition(from: ConfigStatus, to: ConfigStatus): void {
  if (!canTransition(from, to)) {
    throw new ConfigTransitionError(from, to);
  }
}
