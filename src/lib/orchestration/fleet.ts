// Agent fleet enablement (ship inert — EMR-757).
//
// Goal: NEW practices ship with their agent fleet OFF (opt-in), while every
// EXISTING practice keeps running so nothing dark-starts.
//
// Two rules make that safe:
//   1. resolveFleetEnabled treats an ABSENT `fleetDefaultEnabled` as enabled,
//      so any practice predating this field (or with no config row at all)
//      is grandfathered on.
//   2. When a practice config is first created, we stamp `fleetDefaultEnabled`
//      based on the practice's age: practices created before the cutoff get
//      `true` (grandfathered), practices created after get `false` (inert).
//
// An operator still flips individual agents per-practice in the AI-config UI;
// an explicit per-agent `enabled` always wins over the practice default.

/** Ship date for "agents off by default". Practices older than this are kept on. */
export const FLEET_INERT_CUTOFF = new Date("2026-06-05T00:00:00.000Z");

/**
 * The `fleetDefaultEnabled` value to stamp on a newly-created practice config.
 * Existing practices (created before the cutoff) default ON; new ones default
 * OFF (inert). Idempotent — safe to call on any config-create path.
 */
export function defaultFleetEnabledForPractice(practiceCreatedAt: Date): boolean {
  return practiceCreatedAt < FLEET_INERT_CUTOFF;
}

export interface AiFleetConfig {
  /** Practice-wide default. Absent ⇒ enabled (grandfathered). */
  fleetDefaultEnabled?: boolean;
  /** Per-agent overrides keyed by agent id. */
  fleet?: Record<string, { enabled?: boolean; modelId?: string | null }>;
}

/**
 * Decide whether a specific agent runs for a practice, and which model.
 * Precedence: explicit per-agent `enabled` → practice `fleetDefaultEnabled` →
 * grandfathered default (true).
 */
export function resolveFleetEnabled(
  aiConfig: AiFleetConfig | null | undefined,
  agentName: string | undefined,
): { enabled: boolean; modelId: string | null } {
  const fleetDefaultEnabled = aiConfig?.fleetDefaultEnabled ?? true;
  const override = agentName ? aiConfig?.fleet?.[agentName] : undefined;
  const enabled = override?.enabled ?? fleetDefaultEnabled;
  return { enabled, modelId: override?.modelId ?? null };
}
