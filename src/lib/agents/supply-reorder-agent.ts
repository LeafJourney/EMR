// ===========================================================================
// EMR-789 — supplyReorderAgent
// ===========================================================================
// First sub-agent under `practiceManagerAgent`. Shape mirrors
// `inventoryAlertAgent` but writes to the real `Supply` / `SupplyOrder`
// tables introduced in EMR-788.
//
// Lifecycle: OBSERVE → PROPOSE → (never auto-submit; that lives in the
// trust-threshold layer, EMR-793).
//
// Invariants honored here:
//   * Always drafts in `agent_drafted`. Never sets a later status.
//   * Respects the 24h rejection cooldown for `(supplyId, rejectedAt)`.
//   * Idempotent: re-running with no stock changes drafts zero new orders
//     (open-coverage check + cooldown check).
//   * Files an audit entry on every draft.
//   * Files a Task per draft (batched if >3) so the practice owner sees the
//     queue without opening the page.
// ===========================================================================

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { writeAgentAudit } from "@/lib/orchestration/context";
import type { Agent } from "@/lib/orchestration/types";
import {
  OPEN_COVERAGE_STATUSES,
  REJECTION_COOLDOWN_MS,
  computeTotalCents,
  proposedByToColumns,
  recommendedOrderQty,
} from "@/lib/domain/supplies";

const AGENT_ID = "supplyReorderAgent";
const VERSION = "1.0.0";

const input = z.object({
  organizationId: z.string(),
});

const output = z.object({
  draftedCount: z.number(),
  lowStockCount: z.number(),
  alreadyOpenCount: z.number(),
  cooldownSkippedCount: z.number(),
  draftedOrderIds: z.array(z.string()),
});

export type SupplyReorderAgentOutput = z.infer<typeof output>;

export const supplyReorderAgent: Agent<
  z.infer<typeof input>,
  SupplyReorderAgentOutput
> = {
  name: AGENT_ID,
  version: VERSION,
  description:
    "Practice Manager sub-agent. Observes low-stock clinical / office " +
    "supplies and drafts SupplyOrder rows for the practice owner to approve. " +
    "Never auto-submits — the trust-threshold layer makes that decision.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["write.task"],
  requiresApproval: false,

  async run({ organizationId }, ctx) {
    ctx.assertCan("write.task");

    // ── OBSERVE ─────────────────────────────────────────────────────────
    // Pull every non-deleted supply at or below threshold for this org.
    const lowStock = await prisma.supply.findMany({
      where: {
        organizationId,
        deletedAt: null,
      },
      include: { preferredSupplier: true },
    });
    const candidates = lowStock.filter((s) => s.onHand <= s.reorderThreshold);

    // Which supplies already have an open order? (Don't double-draft.)
    const openOrders = await prisma.supplyOrder.findMany({
      where: {
        organizationId,
        deletedAt: null,
        status: { in: OPEN_COVERAGE_STATUSES as unknown as any[] },
        supplyId: { in: candidates.map((s) => s.id) },
      },
      select: { supplyId: true },
    });
    const alreadyOpen = new Set(openOrders.map((o) => o.supplyId));

    // Anti-thrash: any supply rejected in the last 24h is on cooldown.
    const cooldownCutoff = new Date(Date.now() - REJECTION_COOLDOWN_MS);
    const recentRejections = await prisma.supplyOrder.findMany({
      where: {
        organizationId,
        status: "rejected",
        updatedAt: { gte: cooldownCutoff },
        supplyId: { in: candidates.map((s) => s.id) },
      },
      select: { supplyId: true },
    });
    const onCooldown = new Set(recentRejections.map((r) => r.supplyId));

    // ── PROPOSE ─────────────────────────────────────────────────────────
    const draftedOrderIds: string[] = [];
    const draftedDescriptors: Array<{ orderId: string; supplyName: string }> = [];
    let cooldownSkipped = 0;

    for (const supply of candidates) {
      if (alreadyOpen.has(supply.id)) continue;
      if (onCooldown.has(supply.id)) {
        cooldownSkipped += 1;
        continue;
      }
      if (!supply.supplierId) {
        ctx.log("warn", "Skipping supply with no preferred supplier", {
          supplyId: supply.id,
          name: supply.name,
        });
        continue;
      }

      const qty = recommendedOrderQty(supply);
      const unitCostCents = supply.lastUnitCostCents ?? 0;
      const totalCents = computeTotalCents(qty, unitCostCents);

      const proposed = proposedByToColumns({ kind: "agent", agentId: AGENT_ID });

      const order = await prisma.supplyOrder.create({
        data: {
          organizationId,
          supplyId: supply.id,
          supplierId: supply.supplierId,
          status: "agent_drafted",
          qty,
          unitCostCents,
          totalCents,
          ...proposed,
          auditEntries: {
            create: {
              actorKind: "agent",
              actorAgentId: AGENT_ID,
              action: "drafted",
              payload: {
                supplyName: supply.name,
                onHand: supply.onHand,
                reorderThreshold: supply.reorderThreshold,
                qty,
                unitCostCents,
                totalCents,
              },
            },
          },
        },
        select: { id: true },
      });
      draftedOrderIds.push(order.id);
      draftedDescriptors.push({ orderId: order.id, supplyName: supply.name });
    }

    // ── TASKS ───────────────────────────────────────────────────────────
    // One task per draft if small; otherwise a single batched task. Either
    // way the owner sees something in their inbox without checking the page.
    if (draftedOrderIds.length > 0) {
      const taskBase = {
        organizationId,
        status: "open" as const,
        assigneeRole: "practice_owner" as const,
        dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      };
      if (draftedDescriptors.length <= 3) {
        for (const d of draftedDescriptors) {
          await prisma.task.create({
            data: {
              ...taskBase,
              title: `Supply reorder draft awaiting review`,
              description:
                `supplyReorderAgent drafted a reorder for ${d.supplyName}. ` +
                `Order id: ${d.orderId}.\n\nReview at /ops/supplies.`,
            },
          });
        }
      } else {
        await prisma.task.create({
          data: {
            ...taskBase,
            title: `${draftedOrderIds.length} supply reorder drafts awaiting review`,
            description:
              `supplyReorderAgent drafted ${draftedOrderIds.length} reorders. ` +
              `Review at /ops/supplies.`,
          },
        });
      }
    }

    await writeAgentAudit(
      AGENT_ID,
      VERSION,
      organizationId,
      "supply.reorder.drafted",
      { type: "Organization", id: organizationId },
      {
        draftedCount: draftedOrderIds.length,
        lowStockCount: candidates.length,
        alreadyOpenCount: alreadyOpen.size,
        cooldownSkippedCount: cooldownSkipped,
      },
    );

    ctx.log("info", "supplyReorderAgent run complete", {
      draftedCount: draftedOrderIds.length,
      lowStockCount: candidates.length,
      alreadyOpenCount: alreadyOpen.size,
      cooldownSkippedCount: cooldownSkipped,
    });

    return {
      draftedCount: draftedOrderIds.length,
      lowStockCount: candidates.length,
      alreadyOpenCount: alreadyOpen.size,
      cooldownSkippedCount: cooldownSkipped,
      draftedOrderIds,
    };
  },
};
