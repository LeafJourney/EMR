// EMR-743 — Humanize ControllerAuditLog rows for the practice History tab.
//
// Maps dot-namespaced action keys (e.g. "controller.config.published") to a
// short, human-readable phrase suitable for a timeline header. Also derives
// a one-line summary from before/after JSON snapshots when possible.
//
// The ticket calls out a "semantic label map" owned by EMR-744 (Child 2 —
// the diff viewer). That label map is field-level (e.g. `careModel → "Care
// Model"`); this module is action-level (e.g. `controller.config.published
// → "Published configuration"`). They're complementary: when EMR-744 lands
// we'll import its label map for the per-field summary in `summarize()`
// rather than duplicating the prettifier here.
//
// No React, no Prisma — pure functions so they're trivially unit-tested.
// The matching test sits next to this file at `history-humanize.test.ts`.

const ACTION_LABELS: Record<string, string> = {
  // Config lifecycle
  "controller.config.draft_created": "Created draft configuration",
  "controller.config.updated": "Updated configuration",
  "controller.config.published": "Published configuration",
  "controller.config.archived": "Archived configuration",
  "controller.config.rollback": "Rolled back configuration",
  "controller.config.switch_specialty": "Switched specialty",
  "controller.config.template_upgraded": "Upgraded to newer template",

  // Wizard
  "controller.wizard.step.save": "Saved onboarding step",

  // Templates
  "controller.template.create": "Created template",
  "controller.template.update": "Updated template",

  // Super-admin housekeeping
  "controller.super_admin.grant": "Granted super-admin",
  "controller.super_admin.revoke": "Revoked super-admin",
  "controller.super_admin.bootstrap_grant": "Bootstrap-granted super-admin",
  "controller.super_admin.cross_tenant_search": "Cross-tenant search",
  "controller.super_admin.mfa_blocked": "MFA blocked elevation",

  // Migration profiles
  "controller.migration_profile.created": "Created migration profile",
  "controller.migration_profile.read": "Viewed migration profile",

  // Cron-emitted system events (rarely scoped to a single practice but
  // included so unknown labels don't surface as raw strings).
  "controller.anomaly_sweep.completed": "Anomaly sweep completed",
  "controller.practice_health.swept": "Practice health swept",
  "controller.mutation_budget.sweep_completed": "Mutation budget sweep completed",
};

/**
 * Convert an action key like "controller.config.published" into a short
 * human phrase like "Published configuration". Unknown actions fall back to
 * a best-effort title-case of the tail segment ("controller.foo.bar_baz"
 * → "Bar baz") so we never render raw dotted strings in the UI.
 */
export function humanizeAction(action: string): string {
  const known = ACTION_LABELS[action];
  if (known) return known;

  // Fallback: take everything after "controller." (or the whole string),
  // split on the final dot, then humanize the tail.
  const trimmed = action.startsWith("controller.")
    ? action.slice("controller.".length)
    : action;
  const parts = trimmed.split(".");
  const tail = parts[parts.length - 1] ?? trimmed;
  const spaced = tail.replace(/[_.]+/g, " ").trim();
  if (!spaced) return action;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Returns true if the module has an explicit mapping for `action`. Useful
 * in tests to detect drift between action emitters and the label map.
 */
export function hasKnownAction(action: string): boolean {
  return action in ACTION_LABELS;
}

/**
 * Snapshot shape persisted into ControllerAuditLog.before / .after. We
 * type it loosely because the controller writes heterogeneous payloads
 * (configs, templates, wizard steps).
 */
export type AuditSnapshot = Record<string, unknown> | null | undefined;

/**
 * Best-effort one-line summary derived from before/after JSON snapshots.
 * Returns `null` if neither snapshot is informative — the caller can fall
 * back to the action label alone.
 *
 * Strategy: detect new/removed/changed top-level keys (depth-1 only — the
 * full field-level diff lives in the EMR-744 diff viewer linked from each
 * timeline entry). For the common controller patterns:
 *   - `after.keys = [...]`   → "Updated <n> fields"
 *   - newly-present key      → "Set <key>"
 *   - newly-absent key       → "Cleared <key>"
 *   - changed scalar         → "<key>: <before> → <after>"
 */
export function summarizeChange(
  before: AuditSnapshot,
  after: AuditSnapshot,
): string | null {
  // Handle the "after.keys is an array of mutated field names" pattern that
  // src/app/api/configs/[id]/route.ts uses — that's the most common
  // controller emission.
  if (
    after &&
    typeof after === "object" &&
    Array.isArray((after as { keys?: unknown }).keys)
  ) {
    const keys = (after as { keys: unknown[] }).keys.filter(
      (k): k is string => typeof k === "string",
    );
    if (keys.length === 0) return null;
    if (keys.length === 1) return `Updated ${keys[0]}`;
    if (keys.length <= 3) return `Updated ${keys.join(", ")}`;
    return `Updated ${keys.length} fields`;
  }

  const b = (before && typeof before === "object" ? before : {}) as Record<
    string,
    unknown
  >;
  const a = (after && typeof after === "object" ? after : {}) as Record<
    string,
    unknown
  >;
  const beforeKeys = new Set(Object.keys(b));
  const afterKeys = new Set(Object.keys(a));

  const added: string[] = [];
  const removed: string[] = [];
  const changed: string[] = [];

  for (const k of afterKeys) {
    if (!beforeKeys.has(k)) {
      added.push(k);
      continue;
    }
    if (!shallowEqual(b[k], a[k])) {
      changed.push(k);
    }
  }
  for (const k of beforeKeys) {
    if (!afterKeys.has(k)) removed.push(k);
  }

  const total = added.length + removed.length + changed.length;
  if (total === 0) return null;

  // Single-field change: render the actual before → after when both are
  // primitives that are reasonable to inline.
  if (total === 1 && changed.length === 1) {
    const k = changed[0];
    const beforeStr = formatScalar(b[k]);
    const afterStr = formatScalar(a[k]);
    if (beforeStr !== null && afterStr !== null) {
      return `${k}: ${beforeStr} → ${afterStr}`;
    }
    return `Updated ${k}`;
  }
  if (total === 1 && added.length === 1) return `Set ${added[0]}`;
  if (total === 1 && removed.length === 1) return `Cleared ${removed[0]}`;

  const parts: string[] = [];
  if (added.length) parts.push(`+${added.length} added`);
  if (changed.length) parts.push(`${changed.length} changed`);
  if (removed.length) parts.push(`-${removed.length} removed`);
  return parts.join(", ");
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  // For arrays / objects, JSON-stringify is a pragmatic depth-1+ compare.
  // We're never deep-comparing huge blobs here (snapshots are small).
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

function formatScalar(v: unknown): string | null {
  if (v === null) return "null";
  if (v === undefined) return "—";
  const t = typeof v;
  if (t === "string") {
    const s = v as string;
    if (s.length > 32) return `"${s.slice(0, 29)}…"`;
    return `"${s}"`;
  }
  if (t === "number" || t === "boolean") return String(v);
  return null;
}
