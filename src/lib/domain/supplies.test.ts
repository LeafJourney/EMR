import { describe, expect, it } from "vitest";
import {
  classifyStatus,
  computeLowStock,
  computeTotalCents,
  isAgentProposed,
  isTerminalStatus,
  isValidTransition,
  isWithinRejectionCooldown,
  nextValidTransitions,
  recommendedOrderQty,
  actorToColumns,
  proposedByToColumns,
  REJECTION_COOLDOWN_MS,
} from "./supplies";

describe("supplies — pure helpers (EMR-788)", () => {
  describe("classifyStatus", () => {
    it("flags deleted supplies as discontinued", () => {
      expect(
        classifyStatus({ onHand: 100, reorderThreshold: 5, deletedAt: new Date() }),
      ).toBe("discontinued");
    });
    it("flags zero on-hand as out_of_stock", () => {
      expect(classifyStatus({ onHand: 0, reorderThreshold: 5, deletedAt: null })).toBe(
        "out_of_stock",
      );
    });
    it("flags at-threshold as low_stock", () => {
      expect(classifyStatus({ onHand: 5, reorderThreshold: 5, deletedAt: null })).toBe(
        "low_stock",
      );
    });
    it("flags above-threshold as in_stock", () => {
      expect(classifyStatus({ onHand: 10, reorderThreshold: 5, deletedAt: null })).toBe(
        "in_stock",
      );
    });
  });

  describe("computeLowStock", () => {
    it("returns false for discontinued supplies", () => {
      expect(
        computeLowStock({ onHand: 0, reorderThreshold: 5, deletedAt: new Date() }),
      ).toBe(false);
    });
    it("returns true at or below threshold", () => {
      expect(computeLowStock({ onHand: 5, reorderThreshold: 5, deletedAt: null })).toBe(true);
      expect(computeLowStock({ onHand: 1, reorderThreshold: 5, deletedAt: null })).toBe(true);
    });
    it("returns false above threshold", () => {
      expect(computeLowStock({ onHand: 6, reorderThreshold: 5, deletedAt: null })).toBe(false);
    });
  });

  describe("recommendedOrderQty", () => {
    it("uses reorderQty when set", () => {
      expect(recommendedOrderQty({ reorderQty: 12, reorderThreshold: 4 })).toBe(12);
    });
    it("falls back to 2 * threshold when reorderQty is 0", () => {
      expect(recommendedOrderQty({ reorderQty: 0, reorderThreshold: 4 })).toBe(8);
    });
    it("returns at least 1 even when both are zero", () => {
      expect(recommendedOrderQty({ reorderQty: 0, reorderThreshold: 0 })).toBe(1);
    });
  });

  describe("computeTotalCents", () => {
    it("multiplies qty by unit", () => {
      expect(computeTotalCents(10, 250)).toBe(2500);
    });
    it("guards against negatives", () => {
      expect(computeTotalCents(-1, 100)).toBe(0);
      expect(computeTotalCents(10, -1)).toBe(0);
    });
  });

  describe("state machine — nextValidTransitions / isValidTransition", () => {
    it("agent_drafted → awaiting_approval | submitted | cancelled", () => {
      expect(nextValidTransitions("agent_drafted")).toEqual([
        "awaiting_approval",
        "submitted",
        "cancelled",
      ]);
    });
    it("delivered is terminal", () => {
      expect(nextValidTransitions("delivered")).toEqual([]);
      expect(isTerminalStatus("delivered")).toBe(true);
      expect(isTerminalStatus("rejected")).toBe(true);
      expect(isTerminalStatus("cancelled")).toBe(true);
      expect(isTerminalStatus("submitted")).toBe(false);
    });
    it("rejects illegal transitions", () => {
      expect(isValidTransition("agent_drafted", "shipped")).toBe(false);
      expect(isValidTransition("delivered", "shipped")).toBe(false);
      expect(isValidTransition("submitted", "agent_drafted")).toBe(false);
    });
    it("allows the skip-shipping path", () => {
      expect(isValidTransition("submitted", "delivered")).toBe(true);
    });
  });

  describe("isWithinRejectionCooldown — 24h anti-thrash", () => {
    const now = new Date("2026-05-22T12:00:00Z");
    it("treats fresh rejections as within cooldown", () => {
      expect(isWithinRejectionCooldown(new Date(now.getTime() - 60_000), now)).toBe(true);
    });
    it("treats rejections older than 24h as expired", () => {
      expect(
        isWithinRejectionCooldown(new Date(now.getTime() - REJECTION_COOLDOWN_MS - 1), now),
      ).toBe(false);
    });
    it("null rejectedAt → not on cooldown", () => {
      expect(isWithinRejectionCooldown(null, now)).toBe(false);
    });
  });

  describe("proposedBy / actor discriminated unions", () => {
    it("isAgentProposed distinguishes agent vs user", () => {
      expect(isAgentProposed({ proposedBy: { kind: "agent", agentId: "a" } })).toBe(true);
      expect(isAgentProposed({ proposedBy: { kind: "user", userId: "u" } })).toBe(false);
    });
    it("flattens actor → columns (agent)", () => {
      expect(actorToColumns({ kind: "agent", agentId: "supplyReorderAgent" })).toEqual({
        actorKind: "agent",
        actorAgentId: "supplyReorderAgent",
        actorUserId: null,
      });
    });
    it("flattens actor → columns (user)", () => {
      expect(actorToColumns({ kind: "user", userId: "u_1" })).toEqual({
        actorKind: "user",
        actorAgentId: null,
        actorUserId: "u_1",
      });
    });
    it("flattens actor → columns (system)", () => {
      expect(actorToColumns({ kind: "system" })).toEqual({
        actorKind: "system",
        actorAgentId: null,
        actorUserId: null,
      });
    });
    it("flattens proposedBy → columns", () => {
      expect(proposedByToColumns({ kind: "agent", agentId: "x" })).toEqual({
        proposedByKind: "agent",
        proposedByAgentId: "x",
        proposedByUserId: null,
      });
      expect(proposedByToColumns({ kind: "user", userId: "u" })).toEqual({
        proposedByKind: "user",
        proposedByAgentId: null,
        proposedByUserId: "u",
      });
    });
  });
});
