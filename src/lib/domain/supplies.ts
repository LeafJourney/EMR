// ===========================================================================
// EMR-788 — Practice Manager Agent v1: Supplies domain
// ===========================================================================
// Clinical / office supplies (gloves, gowns, BP cuffs, exam-table paper, etc.).
// PARALLEL to — and DISTINCT from — `lib/domain/inventory.ts`, which models
// cannabis product inventory for the dispensary. Do not cross the streams.
//
// This module is the contract that the rest of the Practice Manager Agent v1
// epic builds against:
//   * EMR-789 supplyReorderAgent — reads `computeLowStock` + cooldown helper
//   * EMR-790 practiceManagerAgent — fans out to sub-agents
//   * EMR-791 approval-queue UI    — consumes `SupplyOrder` shapes + helpers
//   * EMR-792 PO/email             — consumes `SupplyOrder` + `Supplier`
//   * EMR-793 trust-threshold      — reads `totalCostCents` to decide auto vs
//                                    awaiting_approval
//   * EMR-794 server actions       — enforces `nextValidTransitions`
//   * EMR-795 fleet KPI tile       — counts `practiceManagerAgent` runs
//
// LOAD-BEARING INVARIANTS (from the EMR-787 epic memo — must hold across
// every consumer of these types):
//   1. Sub-agents always DRAFT. They never set status past `agent_drafted`.
//   2. 24h cooldown on the `(supplyId, rejectedAt)` pair — see
//      `isWithinRejectionCooldown`.
//   3. All monetary amounts are in CENTS (matching the billing convention).
//   4. `proposedBy` is a discriminated union — agent vs user — so audit can
//      reconstruct authorship without joins.
//   5. `markDelivered` is idempotent (server-action side; see EMR-794).
//   6. Auto-submitted orders still file an audit entry — `autoSubmitted=true`
//      is informational, not a bypass.
// ===========================================================================

// ---------------------------------------------------------------------------
// Status enums (mirror prisma enums of the same names)
// ---------------------------------------------------------------------------

export const SUPPLY_ORDER_STATUSES = [
  "agent_drafted",
  "awaiting_approval",
  "approved",
  "submitted",
  "shipped",
  "delivered",
  "rejected",
  "cancelled",
] as const;
export type SupplyOrderStatus = (typeof SUPPLY_ORDER_STATUSES)[number];

export const SUPPLY_ORDER_AUDIT_ACTIONS = [
  "drafted",
  "approved",
  "rejected",
  "submitted",
  "shipped",
  "delivered",
  "edited",
  "cancelled",
  "auto_submitted",
  "reverted",
] as const;
export type SupplyOrderAuditAction = (typeof SUPPLY_ORDER_AUDIT_ACTIONS)[number];

/**
 * Derived stock state. Persisted on `Supply.status` for query speed; the
 * source of truth is `(onHand, reorderThreshold)` — `classifyStatus` is the
 * canonical computation.
 */
export type SupplyStatus =
  | "in_stock"
  | "low_stock"
  | "out_of_stock"
  | "discontinued";

// ---------------------------------------------------------------------------
// `proposedBy` / `actor` discriminated unions
// ---------------------------------------------------------------------------
// Stored as TWO columns on the row (kind + agentId or userId) so audit
// reconstruction is a single SELECT.

export type ProposedBy =
  | { kind: "agent"; agentId: string }
  | { kind: "user"; userId: string };

export type SupplyOrderActor =
  | { kind: "agent"; agentId: string }
  | { kind: "user"; userId: string }
  | { kind: "system" };

// ---------------------------------------------------------------------------
// Plain-object shapes (the ones consumers should read; Prisma types are
// auto-generated but include relations we don't want leaking everywhere).
// ---------------------------------------------------------------------------

export interface Supplier {
  id: string;
  organizationId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  defaultPaymentTermsDays: number;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Supply {
  id: string;
  organizationId: string;
  name: string;
  sku: string | null;
  category: string | null;
  supplierId: string | null;
  reorderThreshold: number;
  reorderQty: number;
  lastUnitCostCents: number | null;
  onHand: number;
  unit: string;
  notes: string | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SupplyOrder {
  id: string;
  organizationId: string;
  supplyId: string;
  supplierId: string;
  status: SupplyOrderStatus;
  qty: number;
  unitCostCents: number;
  totalCents: number;
  proposedBy: ProposedBy;
  approvedByUserId: string | null;
  autoSubmitted: boolean;
  rejectionReason: string | null;
  submittedAt: Date | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  deliveredQty: number | null;
  expectedDeliveryAt: Date | null;
  supplierPoRef: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface SupplyOrderAuditEntry {
  id: string;
  orderId: string;
  actor: SupplyOrderActor;
  action: SupplyOrderAuditAction;
  payload: Record<string, unknown> | null;
  createdAt: Date;
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
// The single source of truth for "can this status go to that status". The
// server actions (EMR-794) enforce these transitions; the UI (EMR-791) reads
// them to know which buttons to enable.
//
// Diagram (from EMR-794 spec):
//
//   agent_drafted ─┬─► auto_submit ──► submitted
//                  ├─► awaiting_approval ──► approved ──► submitted
//                  │                       └─► rejected
//                  └─► cancelled
//
//   submitted ──► shipped ──► delivered
//             └─────────────► delivered   (skip-ship path)
//             └─► cancelled
//   shipped  ──► cancelled                (rare supplier issue)
//
// Terminal: delivered, rejected, cancelled.

const TRANSITIONS: Record<SupplyOrderStatus, readonly SupplyOrderStatus[]> = {
  agent_drafted: ["awaiting_approval", "submitted", "cancelled"],
  awaiting_approval: ["approved", "submitted", "rejected", "cancelled"],
  approved: ["submitted", "cancelled"],
  submitted: ["shipped", "delivered", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  rejected: [],
  cancelled: [],
};

export function nextValidTransitions(
  status: SupplyOrderStatus,
): readonly SupplyOrderStatus[] {
  return TRANSITIONS[status];
}

export function isValidTransition(
  from: SupplyOrderStatus,
  to: SupplyOrderStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

const TERMINAL: ReadonlySet<SupplyOrderStatus> = new Set([
  "delivered",
  "rejected",
  "cancelled",
]);

export function isTerminalStatus(status: SupplyOrderStatus): boolean {
  return TERMINAL.has(status);
}

const OPEN_COVERAGE: ReadonlySet<SupplyOrderStatus> = new Set([
  "agent_drafted",
  "awaiting_approval",
  "approved",
  "submitted",
  "shipped",
]);

/** Statuses that count as "this supply already has an open order". */
export function isOpenCoverage(status: SupplyOrderStatus): boolean {
  return OPEN_COVERAGE.has(status);
}

export const OPEN_COVERAGE_STATUSES: readonly SupplyOrderStatus[] = Array.from(
  OPEN_COVERAGE,
);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** True if this order was drafted by a sub-agent (vs proposed by a human). */
export function isAgentProposed(order: Pick<SupplyOrder, "proposedBy">): boolean {
  return order.proposedBy.kind === "agent";
}

/** Quantity to order; falls back to `2 * reorderThreshold` if reorderQty is 0. */
export function recommendedOrderQty(
  supply: Pick<Supply, "reorderQty" | "reorderThreshold">,
): number {
  if (supply.reorderQty && supply.reorderQty > 0) return supply.reorderQty;
  return Math.max(1, supply.reorderThreshold * 2);
}

/** Map (onHand, reorderThreshold) → SupplyStatus. */
export function classifyStatus(
  supply: Pick<Supply, "onHand" | "reorderThreshold" | "deletedAt">,
): SupplyStatus {
  if (supply.deletedAt) return "discontinued";
  if (supply.onHand <= 0) return "out_of_stock";
  if (supply.onHand <= supply.reorderThreshold) return "low_stock";
  return "in_stock";
}

/** True if a supply is at or below its reorder threshold (low or out). */
export function computeLowStock(
  supply: Pick<Supply, "onHand" | "reorderThreshold" | "deletedAt">,
): boolean {
  if (supply.deletedAt) return false;
  return supply.onHand <= supply.reorderThreshold;
}

export const REJECTION_COOLDOWN_MS = 24 * 60 * 60 * 1000;

/**
 * Anti-thrash: a sub-agent must not redraft a supply that the owner just
 * rejected within the last 24h. The server action (EMR-794) stamps
 * `rejectionReason` AND a `rejected` audit entry on the prior order; the
 * agent's observe step checks the most-recent rejected order for each supply.
 */
export function isWithinRejectionCooldown(
  rejectedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!rejectedAt) return false;
  return now.getTime() - rejectedAt.getTime() < REJECTION_COOLDOWN_MS;
}

/** Compute total cents (qty * unit), guarding against negatives. */
export function computeTotalCents(qty: number, unitCostCents: number): number {
  return Math.max(0, Math.trunc(qty) * Math.max(0, Math.trunc(unitCostCents)));
}

// ---------------------------------------------------------------------------
// Audit-entry construction helpers (kept here so every writer formats actors
// the same way — see EMR-794 server actions + EMR-789 agent).
// ---------------------------------------------------------------------------

export interface AuditEntryInput {
  orderId: string;
  actor: SupplyOrderActor;
  action: SupplyOrderAuditAction;
  payload?: Record<string, unknown> | null;
}

/** Flatten the actor discriminated union into the two prisma columns. */
export function actorToColumns(actor: SupplyOrderActor): {
  actorKind: "agent" | "user" | "system";
  actorAgentId: string | null;
  actorUserId: string | null;
} {
  if (actor.kind === "agent")
    return { actorKind: "agent", actorAgentId: actor.agentId, actorUserId: null };
  if (actor.kind === "user")
    return { actorKind: "user", actorAgentId: null, actorUserId: actor.userId };
  return { actorKind: "system", actorAgentId: null, actorUserId: null };
}

/** Flatten the proposedBy union into the two prisma columns. */
export function proposedByToColumns(p: ProposedBy): {
  proposedByKind: "agent" | "user";
  proposedByAgentId: string | null;
  proposedByUserId: string | null;
} {
  return p.kind === "agent"
    ? { proposedByKind: "agent", proposedByAgentId: p.agentId, proposedByUserId: null }
    : { proposedByKind: "user", proposedByAgentId: null, proposedByUserId: p.userId };
}
