// EMR-752 — Seat-count enforcement at provider creation.
//
// The Membership-create path must reject when an organization already has
// `seatLimit` active clinician memberships for its current subscription tier.
// We expose a small, pure helper that returns either an "allow" decision or
// a structured "block" response that callers can translate to an HTTP 402
// with the shape:
//
//   { code: "seat_limit_exceeded", currentSeats, seatLimit, suggestedTier }
//
// This module is intentionally pure-ish so it is unit-testable without a
// live database. The Prisma-backed lookup helpers are co-located so call
// sites can `await checkSeatLimit({ prisma, organizationId })` and get a
// single typed result.

import "server-only";

import type { PrismaClient } from "@prisma/client";
import { logControllerAction } from "@/lib/auth/audit-stub";
import type { AuthedUser } from "@/lib/auth/session";

/** Tier identifiers — mirror the registry in `src/lib/billing/tiers.ts` (EMR-751). */
export const BILLING_TIERS = ["solo", "team", "practice", "enterprise"] as const;
export type BillingTier = (typeof BILLING_TIERS)[number];

/** Seat limits per tier. `null` = unlimited. */
export const TIER_SEAT_LIMITS: Record<BillingTier, number | null> = {
  solo: 1,
  team: 5,
  practice: 25,
  enterprise: null,
};

/** Roles that count as "clinician seats" for billing purposes. */
export const CLINICIAN_SEAT_ROLES = [
  "clinician",
  "practice_owner",
  "practice_admin",
] as const;

export type SeatLimitDecision =
  | { allow: true }
  | {
      allow: false;
      code: "seat_limit_exceeded";
      currentSeats: number;
      seatLimit: number;
      tier: BillingTier;
      suggestedTier: BillingTier | null;
    };

/**
 * Pure decision: given the current seat count and the org's tier, decide
 * whether one more clinician can be added.
 *
 * Exported separately so unit tests can exercise the logic without a DB.
 */
export function decideSeatLimit(args: {
  currentSeats: number;
  tier: BillingTier;
}): SeatLimitDecision {
  const seatLimit = TIER_SEAT_LIMITS[args.tier];
  if (seatLimit === null) return { allow: true };
  if (args.currentSeats < seatLimit) return { allow: true };
  return {
    allow: false,
    code: "seat_limit_exceeded",
    currentSeats: args.currentSeats,
    seatLimit,
    tier: args.tier,
    suggestedTier: nextTierUp(args.tier),
  };
}

/** Returns the next tier up that has a strictly higher seat ceiling. */
export function nextTierUp(tier: BillingTier): BillingTier | null {
  const idx = BILLING_TIERS.indexOf(tier);
  for (let i = idx + 1; i < BILLING_TIERS.length; i += 1) {
    return BILLING_TIERS[i]!;
  }
  return null;
}

/**
 * DB-backed check. Loads the org's current seat count + subscription tier
 * and returns the decision. The PracticeSubscription model is wired up in
 * EMR-751 — until that lands, every org is treated as tier `team` so
 * onboardings don't unexpectedly fail closed in dev.
 */
export async function checkSeatLimit(args: {
  prisma: PrismaClient;
  organizationId: string;
}): Promise<SeatLimitDecision> {
  const { prisma, organizationId } = args;

  const currentSeats = await prisma.membership.count({
    where: {
      organizationId,
      role: { in: [...CLINICIAN_SEAT_ROLES] as never[] },
    },
  });

  const tier = await resolveTier(prisma, organizationId);
  return decideSeatLimit({ currentSeats, tier });
}

/**
 * Resolve the org's billing tier. Reads PracticeSubscription when the
 * model is generated (EMR-751); otherwise returns the dev default.
 */
async function resolveTier(
  prisma: PrismaClient,
  organizationId: string,
): Promise<BillingTier> {
  // Reach through `unknown` so this compiles before EMR-751 generates the
  // PracticeSubscription delegate. Once that lands, swap to the typed call.
  const delegate = (prisma as unknown as Record<string, unknown>)[
    "practiceSubscription"
  ];
  if (
    !delegate ||
    typeof (delegate as { findUnique?: unknown }).findUnique !== "function"
  ) {
    return "team";
  }
  const sub = (await (
    delegate as {
      findUnique: (args: {
        where: { organizationId: string };
        select: { tier: true };
      }) => Promise<{ tier: string } | null>;
    }
  ).findUnique({
    where: { organizationId },
    select: { tier: true },
  })) as { tier: string } | null;

  if (!sub) return "team";
  return (BILLING_TIERS as readonly string[]).includes(sub.tier)
    ? (sub.tier as BillingTier)
    : "team";
}

/**
 * Convenience wrapper for API routes: returns the decision *and* writes
 * a `super_admin.seat_limit_block` ControllerAuditLog row when blocked.
 * The audit row is best-effort — failure does not change the decision.
 */
export async function enforceSeatLimit(args: {
  prisma: PrismaClient;
  organizationId: string;
  actor: Pick<AuthedUser, "id" | "email" | "roles" | "organizationId">;
}): Promise<SeatLimitDecision> {
  const decision = await checkSeatLimit({
    prisma: args.prisma,
    organizationId: args.organizationId,
  });

  if (!decision.allow) {
    await logControllerAction({
      actor: args.actor,
      action: "super_admin.seat_limit_block",
      targetId: args.organizationId,
      reason: `seat_limit_exceeded tier=${decision.tier} current=${decision.currentSeats} limit=${decision.seatLimit}`,
      after: {
        code: decision.code,
        currentSeats: decision.currentSeats,
        seatLimit: decision.seatLimit,
        tier: decision.tier,
        suggestedTier: decision.suggestedTier,
      },
    }).catch(() => {
      // The audit insert already retries internally; if it ultimately
      // fails we don't change the seat decision.
    });
  }

  return decision;
}
