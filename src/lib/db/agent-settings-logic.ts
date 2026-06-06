// EMR-974 — pure resolution logic for the Agent Fleet enable/disable flag.
//
// Kept free of Prisma / server-only so it is unit-testable and importable from
// the orchestration runner (separate track) without dragging in the DB client.
// The DB accessors live in ./agent-settings.ts.

/**
 * Resolve whether an agent is enabled given its (possibly absent) setting row.
 *
 * The contract is fail-OPEN for agents: a missing row means "enabled". Agents
 * ship on by default; an explicit `enabled = false` row is the only thing that
 * turns one off. This matches the directive that staff can disable any agent
 * "without affecting the integrity of the platform" — a brand-new agent with no
 * row anywhere keeps running until someone deliberately switches it off.
 */
export function resolveAgentEnabled(
  row: { enabled: boolean } | null | undefined,
): boolean {
  return row?.enabled ?? true;
}
