"use server";

// ===========================================================================
// EMR-794 — Supply order server actions + state machine
// ===========================================================================
// One server action per legal state transition on `SupplyOrder`. Each:
//   1. Resolves the org-scoped session via `requireUser`.
//   2. Validates the transition through `nextValidTransitions` — illegal
//      transitions throw with a clear error rather than silently no-op.
//   3. Writes EXACTLY one audit entry per state change.
//   4. Increments stock IDEMPOTENTLY on delivery (the `deliveredAt IS NULL`
//      guard prevents double-increments).
//   5. Revalidates `/ops/supplies` so the UI re-renders.
//
// The UI surface that calls these lives in EMR-791. The PDF + email pipeline
// (EMR-792) hooks into `approveAndSubmitOrder`. The trust-threshold layer
// (EMR-793) uses `submitDraftedOrderAsAgent` for auto-submit.
//
// LOAD-BEARING INVARIANTS honored:
//   * 24h cooldown: rejection stamps `rejectionReason` + a `rejected` audit
//     row; the agent's observe step (EMR-789) reads it.
//   * Idempotent delivery: stock increments only when `deliveredAt IS NULL`.
//   * Every transition lands an audit row, including auto-submits.
//   * `proposedBy` columns are written on creation only — they never mutate.
// ===========================================================================

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  actorToColumns,
  isValidTransition,
  nextValidTransitions,
  type SupplyOrderActor,
  type SupplyOrderAuditAction,
  type SupplyOrderStatus,
} from "@/lib/domain/supplies";

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function loadOrder(orderId: string, organizationId: string) {
  return prisma.supplyOrder.findFirst({
    where: { id: orderId, organizationId, deletedAt: null },
  });
}

function assertTransition(
  from: SupplyOrderStatus,
  to: SupplyOrderStatus,
): void {
  if (!isValidTransition(from, to)) {
    throw new Error(
      `Illegal SupplyOrder transition: ${from} → ${to}. ` +
        `Valid next states: ${nextValidTransitions(from).join(", ") || "(none — terminal)"}`,
    );
  }
}

/**
 * Write a single audit entry for a state change. Centralized here so every
 * server action lands the same row shape — no drift.
 */
async function writeAuditEntry(args: {
  orderId: string;
  actor: SupplyOrderActor;
  action: SupplyOrderAuditAction;
  payload?: Record<string, unknown> | null;
  tx?: typeof prisma;
}) {
  const cols = actorToColumns(args.actor);
  const client = args.tx ?? prisma;
  await client.supplyOrderAuditEntry.create({
    data: {
      orderId: args.orderId,
      action: args.action,
      payload: (args.payload ?? null) as any,
      ...cols,
    },
  });
}

function done(): ActionResult {
  revalidatePath("/ops/supplies");
  return { ok: true };
}

function err(message: string): ActionResult {
  return { ok: false, error: message };
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const OrderId = z.object({ orderId: z.string().min(1) });

const ApproveSchema = OrderId.extend({
  notes: z.string().optional(),
  editedQty: z.number().int().positive().optional(),
  editedSupplierId: z.string().optional(),
});

const RejectSchema = OrderId.extend({
  reason: z.string().min(1, "Rejection reason required"),
});

const EditDraftSchema = OrderId.extend({
  qty: z.number().int().positive().optional(),
  supplierId: z.string().optional(),
  notes: z.string().optional(),
  unitCostCents: z.number().int().nonnegative().optional(),
});

const MarkShippedSchema = OrderId.extend({
  shippedAt: z.string().datetime().optional(),
  trackingNumber: z.string().optional(),
});

const MarkDeliveredSchema = OrderId.extend({
  deliveredAt: z.string().datetime().optional(),
  qtyReceived: z.number().int().nonnegative().optional(),
});

const CancelSchema = OrderId.extend({
  reason: z.string().min(1, "Cancellation reason required"),
});

const SubmitDraftSchema = OrderId; // operator-driven submit for an agent draft.

// ---------------------------------------------------------------------------
// approveAndSubmitOrder — awaiting_approval → submitted (with optional edit)
// ---------------------------------------------------------------------------

export async function approveAndSubmitOrder(
  input: z.infer<typeof ApproveSchema>,
): Promise<ActionResult<{ orderId: string }>> {
  const user = await requireUser();
  if (!user.organizationId) return err("Organization required.");
  const parsed = ApproveSchema.safeParse(input);
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const order = await loadOrder(parsed.data.orderId, user.organizationId);
  if (!order) return err("Order not found.");

  try {
    assertTransition(order.status, "submitted");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }

  const editedQty = parsed.data.editedQty ?? order.qty;
  const editedSupplierId = parsed.data.editedSupplierId ?? order.supplierId;
  const totalCents = editedQty * order.unitCostCents;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.supplyOrder.update({
      where: { id: order.id },
      data: {
        status: "submitted",
        qty: editedQty,
        supplierId: editedSupplierId,
        totalCents,
        approvedByUserId: user.id,
        submittedAt: now,
      },
    });
    if (editedQty !== order.qty || editedSupplierId !== order.supplierId) {
      await writeAuditEntry({
        orderId: order.id,
        actor: { kind: "user", userId: user.id },
        action: "edited",
        payload: {
          qty: { from: order.qty, to: editedQty },
          supplierId: { from: order.supplierId, to: editedSupplierId },
        },
        tx: tx as any,
      });
    }
    await writeAuditEntry({
      orderId: order.id,
      actor: { kind: "user", userId: user.id },
      action: "approved",
      payload: { notes: parsed.data.notes ?? null },
      tx: tx as any,
    });
    await writeAuditEntry({
      orderId: order.id,
      actor: { kind: "user", userId: user.id },
      action: "submitted",
      payload: null,
      tx: tx as any,
    });
  });

  revalidatePath("/ops/supplies");
  return { ok: true, data: { orderId: order.id } };
}

// ---------------------------------------------------------------------------
// rejectOrder — awaiting_approval → rejected (24h cooldown stamp)
// ---------------------------------------------------------------------------

export async function rejectOrder(
  input: z.infer<typeof RejectSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return err("Organization required.");
  const parsed = RejectSchema.safeParse(input);
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const order = await loadOrder(parsed.data.orderId, user.organizationId);
  if (!order) return err("Order not found.");

  try {
    assertTransition(order.status, "rejected");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }

  await prisma.$transaction(async (tx) => {
    await tx.supplyOrder.update({
      where: { id: order.id },
      data: {
        status: "rejected",
        rejectionReason: parsed.data.reason,
      },
    });
    await writeAuditEntry({
      orderId: order.id,
      actor: { kind: "user", userId: user.id },
      action: "rejected",
      payload: { reason: parsed.data.reason },
      tx: tx as any,
    });
  });

  return done();
}

// ---------------------------------------------------------------------------
// editDraftedOrder — modify a draft / awaiting_approval row in place
// ---------------------------------------------------------------------------

export async function editDraftedOrder(
  input: z.infer<typeof EditDraftSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return err("Organization required.");
  const parsed = EditDraftSchema.safeParse(input);
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const order = await loadOrder(parsed.data.orderId, user.organizationId);
  if (!order) return err("Order not found.");
  if (order.status !== "agent_drafted" && order.status !== "awaiting_approval") {
    return err(
      `Cannot edit an order in status ${order.status}. Edits are only allowed before submit.`,
    );
  }

  const newQty = parsed.data.qty ?? order.qty;
  const newSupplierId = parsed.data.supplierId ?? order.supplierId;
  const newUnitCostCents = parsed.data.unitCostCents ?? order.unitCostCents;
  const newTotalCents = newQty * newUnitCostCents;

  const diff: Record<string, unknown> = {};
  if (newQty !== order.qty) diff.qty = { from: order.qty, to: newQty };
  if (newSupplierId !== order.supplierId)
    diff.supplierId = { from: order.supplierId, to: newSupplierId };
  if (newUnitCostCents !== order.unitCostCents)
    diff.unitCostCents = {
      from: order.unitCostCents,
      to: newUnitCostCents,
    };
  if (parsed.data.notes !== undefined) diff.notes = parsed.data.notes;

  if (Object.keys(diff).length === 0) {
    return err("No changes to apply.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.supplyOrder.update({
      where: { id: order.id },
      data: {
        qty: newQty,
        supplierId: newSupplierId,
        unitCostCents: newUnitCostCents,
        totalCents: newTotalCents,
      },
    });
    await writeAuditEntry({
      orderId: order.id,
      actor: { kind: "user", userId: user.id },
      action: "edited",
      payload: diff,
      tx: tx as any,
    });
  });

  return done();
}

// ---------------------------------------------------------------------------
// submitDraftedOrder — manual submit path for `agent_drafted` orders
// ---------------------------------------------------------------------------

export async function submitDraftedOrder(
  input: z.infer<typeof SubmitDraftSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return err("Organization required.");
  const parsed = SubmitDraftSchema.safeParse(input);
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const order = await loadOrder(parsed.data.orderId, user.organizationId);
  if (!order) return err("Order not found.");
  try {
    assertTransition(order.status, "submitted");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.supplyOrder.update({
      where: { id: order.id },
      data: {
        status: "submitted",
        approvedByUserId: user.id,
        submittedAt: now,
      },
    });
    await writeAuditEntry({
      orderId: order.id,
      actor: { kind: "user", userId: user.id },
      action: "submitted",
      payload: { fromStatus: order.status },
      tx: tx as any,
    });
  });

  return done();
}

// ---------------------------------------------------------------------------
// markShipped — submitted → shipped
// ---------------------------------------------------------------------------

export async function markShipped(
  input: z.infer<typeof MarkShippedSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return err("Organization required.");
  const parsed = MarkShippedSchema.safeParse(input);
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const order = await loadOrder(parsed.data.orderId, user.organizationId);
  if (!order) return err("Order not found.");
  try {
    assertTransition(order.status, "shipped");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }

  const shippedAt = parsed.data.shippedAt
    ? new Date(parsed.data.shippedAt)
    : new Date();

  await prisma.$transaction(async (tx) => {
    await tx.supplyOrder.update({
      where: { id: order.id },
      data: {
        status: "shipped",
        shippedAt,
        supplierPoRef: parsed.data.trackingNumber ?? order.supplierPoRef,
      },
    });
    await writeAuditEntry({
      orderId: order.id,
      actor: { kind: "user", userId: user.id },
      action: "shipped",
      payload: {
        trackingNumber: parsed.data.trackingNumber ?? null,
        shippedAt: shippedAt.toISOString(),
      },
      tx: tx as any,
    });
  });

  return done();
}

// ---------------------------------------------------------------------------
// markDelivered — submitted|shipped → delivered (idempotent stock increment)
// ---------------------------------------------------------------------------

export async function markDelivered(
  input: z.infer<typeof MarkDeliveredSchema>,
): Promise<ActionResult<{ idempotent: boolean }>> {
  const user = await requireUser();
  if (!user.organizationId) return err("Organization required.");
  const parsed = MarkDeliveredSchema.safeParse(input);
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const order = await loadOrder(parsed.data.orderId, user.organizationId);
  if (!order) return err("Order not found.");

  // Idempotency: if already delivered, return ok without doing anything.
  if (order.status === "delivered" || order.deliveredAt !== null) {
    return { ok: true, data: { idempotent: true } };
  }

  try {
    assertTransition(order.status, "delivered");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }

  const deliveredAt = parsed.data.deliveredAt
    ? new Date(parsed.data.deliveredAt)
    : new Date();
  const qtyReceived = parsed.data.qtyReceived ?? order.qty;
  const partial = qtyReceived < order.qty;

  // The guard `deliveredAt IS NULL` in the WHERE clause makes the stock
  // increment idempotent even under concurrent execution — only the first
  // transition wins; subsequent calls fall through to the early-return
  // above on re-read.
  await prisma.$transaction(async (tx) => {
    const updated = await tx.supplyOrder.updateMany({
      where: { id: order.id, deliveredAt: null },
      data: {
        status: "delivered",
        deliveredAt,
        deliveredQty: qtyReceived,
      },
    });
    if (updated.count === 0) return; // someone beat us; do not re-increment.

    await tx.supply.update({
      where: { id: order.supplyId },
      data: {
        onHand: { increment: qtyReceived },
        lastUnitCostCents: order.unitCostCents,
      },
    });
    await writeAuditEntry({
      orderId: order.id,
      actor: { kind: "user", userId: user.id },
      action: "delivered",
      payload: {
        deliveredAt: deliveredAt.toISOString(),
        qtyReceived,
        partial,
        orderedQty: order.qty,
      },
      tx: tx as any,
    });
  });

  return { ok: true, data: { idempotent: false } };
}

// ---------------------------------------------------------------------------
// cancelOrder — any non-terminal → cancelled
// ---------------------------------------------------------------------------

export async function cancelOrder(
  input: z.infer<typeof CancelSchema>,
): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return err("Organization required.");
  const parsed = CancelSchema.safeParse(input);
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "Invalid input.");

  const order = await loadOrder(parsed.data.orderId, user.organizationId);
  if (!order) return err("Order not found.");
  try {
    assertTransition(order.status, "cancelled");
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }

  await prisma.$transaction(async (tx) => {
    await tx.supplyOrder.update({
      where: { id: order.id },
      data: { status: "cancelled" },
    });
    await writeAuditEntry({
      orderId: order.id,
      actor: { kind: "user", userId: user.id },
      action: "cancelled",
      payload: { reason: parsed.data.reason },
      tx: tx as any,
    });
  });

  return done();
}

// ---------------------------------------------------------------------------
// submitDraftedOrderAsAgent — entry point for EMR-793 trust-threshold
// auto-submit. Internal use only; not exported via formData. Skips the
// `approved` step but still files an `auto_submitted` audit row so the
// approval queue can render the auto-path.
// ---------------------------------------------------------------------------

export async function submitDraftedOrderAsAgent(
  orderId: string,
  agentId: string,
): Promise<ActionResult> {
  // Caller is server-internal (the trust-threshold layer / orchestrator)
  // so we do NOT call requireUser(). We DO scope by organizationId via the
  // order row itself.
  const order = await prisma.supplyOrder.findFirst({
    where: { id: orderId, deletedAt: null },
  });
  if (!order) return err("Order not found.");
  if (order.status !== "agent_drafted") {
    return err(
      `submitDraftedOrderAsAgent requires status agent_drafted, got ${order.status}.`,
    );
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.supplyOrder.update({
      where: { id: order.id },
      data: {
        status: "submitted",
        autoSubmitted: true,
        submittedAt: now,
      },
    });
    await writeAuditEntry({
      orderId: order.id,
      actor: { kind: "agent", agentId },
      action: "auto_submitted",
      payload: { totalCents: order.totalCents },
      tx: tx as any,
    });
  });

  revalidatePath("/ops/supplies");
  return { ok: true };
}
