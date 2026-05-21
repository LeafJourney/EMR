// EMR-751 — Billing tier registry.
//
// Single source of truth for the per-tier defaults that the
// PracticeSubscription model + downstream cost / seat enforcement read.
//
// The tier names must match `BILLING_TIERS` in seat-enforcement.ts (we
// re-export from there so we don't drift). Anything that varies per
// customer (overrides, custom Stripe price IDs) lives on the
// PracticeSubscription row itself.

import {
  BILLING_TIERS,
  TIER_SEAT_LIMITS,
  type BillingTier,
} from "./seat-enforcement";

export { BILLING_TIERS, TIER_SEAT_LIMITS, type BillingTier };

export interface TierProfile {
  tier: BillingTier;
  /** Display label for the admin UI. */
  label: string;
  /** Default monthly recurring revenue, in cents. Used by EMR-753. */
  monthlyRevenueCents: number;
  /** Default seat cap. `null` means unlimited. */
  seatLimit: number | null;
  /** Default monthly token allowance for the AI broker. `null` = none enforced. */
  includedMonthlyTokens: number | null;
}

export const TIER_PROFILES: Record<BillingTier, TierProfile> = {
  solo: {
    tier: "solo",
    label: "Solo Practitioner",
    monthlyRevenueCents: 9900,
    seatLimit: 1,
    includedMonthlyTokens: 500_000,
  },
  team: {
    tier: "team",
    label: "Team",
    monthlyRevenueCents: 39900,
    seatLimit: 5,
    includedMonthlyTokens: 3_000_000,
  },
  practice: {
    tier: "practice",
    label: "Practice",
    monthlyRevenueCents: 149900,
    seatLimit: 25,
    includedMonthlyTokens: 15_000_000,
  },
  enterprise: {
    tier: "enterprise",
    label: "Enterprise",
    monthlyRevenueCents: 499900,
    seatLimit: null,
    includedMonthlyTokens: null,
  },
};

export function getTierProfile(tier: BillingTier): TierProfile {
  return TIER_PROFILES[tier];
}

export function isBillingTier(value: string): value is BillingTier {
  return (BILLING_TIERS as readonly string[]).includes(value);
}
