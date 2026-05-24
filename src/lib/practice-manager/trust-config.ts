// ---------------------------------------------------------------------------
// Practice Manager Agent — trust thresholds + approval routing (EMR-793)
//
// Pure logic. Reads per-org config from a JSON blob stored under
// `Organization.settings.practiceManager` (no schema change — the
// Architect's PR may surface the `settings Json` field; until then this
// module simply falls back to safe defaults whenever the input is absent
// or malformed).
//
// The supply-reorder state machine imports `shouldAutoSubmit` from here.
// Keep the exported surface STABLE.
// ---------------------------------------------------------------------------

/** Roles allowed to approve over-threshold supply orders. */
export type PracticeManagerApproverRole =
  | "practice_owner"
  | "operator"
  | "practice_admin";

export interface PracticeManagerApprover {
  role: PracticeManagerApproverRole;
  /** Optional explicit user allowlist within the role. Empty/undefined = any user with the role. */
  userIds?: string[];
}

export interface PracticeManagerTrustConfig {
  /** Hard ceiling per individual order ($ in cents). Above this = approval required. */
  perOrderCeilingCents: number;
  /** Cumulative daily ceiling across auto-submitted orders ($ in cents). */
  perDayCeilingCents: number;
  /** Ordered list of approver roles consulted by the state machine. */
  approvers: PracticeManagerApprover[];
}

// ---------------------------------------------------------------------------
// Defaults — used whenever per-org settings are missing or malformed.
// ---------------------------------------------------------------------------

export const DEFAULT_PER_ORDER_CEILING_CENTS = 50_000; // $500
export const DEFAULT_PER_DAY_CEILING_CENTS = 200_000; // $2,000

export const DEFAULT_APPROVERS: PracticeManagerApprover[] = [
  { role: "practice_owner" },
];

const ALLOWED_ROLES: ReadonlySet<PracticeManagerApproverRole> = new Set([
  "practice_owner",
  "operator",
  "practice_admin",
]);

// ---------------------------------------------------------------------------
// loadTrustConfig — parse the JSON blob, falling back to defaults at every
// branch where the input isn't shaped correctly. Never throws.
// ---------------------------------------------------------------------------

export function loadTrustConfig(orgSettings: unknown): PracticeManagerTrustConfig {
  const defaults: PracticeManagerTrustConfig = {
    perOrderCeilingCents: DEFAULT_PER_ORDER_CEILING_CENTS,
    perDayCeilingCents: DEFAULT_PER_DAY_CEILING_CENTS,
    approvers: DEFAULT_APPROVERS,
  };

  if (!isPlainObject(orgSettings)) return defaults;

  const pm = (orgSettings as Record<string, unknown>).practiceManager;
  if (!isPlainObject(pm)) return defaults;

  const perOrderCeilingCents = parsePositiveInt(
    pm.perOrderCeilingCents,
    DEFAULT_PER_ORDER_CEILING_CENTS,
  );
  const perDayCeilingCents = parsePositiveInt(
    pm.perDayCeilingCents,
    DEFAULT_PER_DAY_CEILING_CENTS,
  );
  const approvers = parseApprovers(pm.approvers);

  return { perOrderCeilingCents, perDayCeilingCents, approvers };
}

// ---------------------------------------------------------------------------
// shouldAutoSubmit — the state-machine gate. Returns { autoSubmit, reason }.
// `reason` is human-readable and intended to land in the audit log.
// ---------------------------------------------------------------------------

export interface ShouldAutoSubmitArgs {
  /** Total cost of the single order under evaluation, in cents. */
  orderTotalCents: number;
  /** Sum of all auto-submitted orders for the org so far today, in cents. */
  dayRunningTotalCents: number;
  config: PracticeManagerTrustConfig;
}

export interface ShouldAutoSubmitResult {
  autoSubmit: boolean;
  /** Short explanation suitable for audit-log entries / approval-queue badges. */
  reason: string;
}

export function shouldAutoSubmit(args: ShouldAutoSubmitArgs): ShouldAutoSubmitResult {
  const { orderTotalCents, dayRunningTotalCents, config } = args;

  if (!Number.isFinite(orderTotalCents) || orderTotalCents < 0) {
    return { autoSubmit: false, reason: "invalid_order_total" };
  }
  if (orderTotalCents > config.perOrderCeilingCents) {
    return {
      autoSubmit: false,
      reason: `over_per_order_ceiling:${orderTotalCents}>${config.perOrderCeilingCents}`,
    };
  }
  const projectedDay = dayRunningTotalCents + orderTotalCents;
  if (projectedDay > config.perDayCeilingCents) {
    return {
      autoSubmit: false,
      reason: `over_per_day_ceiling:${projectedDay}>${config.perDayCeilingCents}`,
    };
  }
  return {
    autoSubmit: true,
    reason: `within_ceilings:order=${orderTotalCents},day=${projectedDay}`,
  };
}

// ---------------------------------------------------------------------------
// routeApprovers — convenience for the approval-queue UI / notifier.
// Returns a plain shape with `role` widened to `string` (per spec) so the
// caller doesn't need to import the role union.
// ---------------------------------------------------------------------------

export function routeApprovers(
  config: PracticeManagerTrustConfig,
): { role: string; userIds?: string[] }[] {
  return config.approvers.map((a) => ({
    role: a.role,
    ...(a.userIds && a.userIds.length > 0 ? { userIds: a.userIds } : {}),
  }));
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function parsePositiveInt(v: unknown, fallback: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return fallback;
  return Math.floor(v);
}

function parseApprovers(v: unknown): PracticeManagerApprover[] {
  if (!Array.isArray(v) || v.length === 0) return DEFAULT_APPROVERS;
  const out: PracticeManagerApprover[] = [];
  for (const entry of v) {
    if (!isPlainObject(entry)) continue;
    const role = entry.role;
    if (typeof role !== "string" || !ALLOWED_ROLES.has(role as PracticeManagerApproverRole)) {
      continue;
    }
    const approver: PracticeManagerApprover = { role: role as PracticeManagerApproverRole };
    if (Array.isArray(entry.userIds)) {
      const ids = entry.userIds.filter((x): x is string => typeof x === "string" && x.length > 0);
      if (ids.length > 0) approver.userIds = ids;
    }
    out.push(approver);
  }
  return out.length > 0 ? out : DEFAULT_APPROVERS;
}
