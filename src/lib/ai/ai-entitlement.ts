// Phase 1 — membership entitlement gate for AI spend.
//
// AI calls cost money (the platform key on managed accounts, the practice's key
// on BYOK). We don't burn spend on an org whose membership isn't current. The
// gate reads PracticeSubscription and answers a single question: may this org
// make an AI call right now?
//
// Default posture is deliberate:
//   - No subscription row at all  → ALLOWED. Orgs predating metered billing
//     (and dev/seed orgs) must not have their clinical fleet silently disabled.
//     Set AI_REQUIRE_SUBSCRIPTION=true to fail closed instead.
//   - Subscription present but not active/trialing, OR throttled → BLOCKED.
//     This is the real intent: stop spend on past-due / canceled / capped orgs.

import { prisma } from "@/lib/db/prisma";

/** Subscription statuses that entitle AI usage. */
export const ENTITLED_STATUSES = ["active", "trialing"] as const;

export interface EntitlementInput {
  /** PracticeSubscription.status, or null when no subscription row exists. */
  status: string | null;
  /** PracticeSubscription.throttled (EMR-756 cost cutoff). */
  throttled: boolean;
  /** Whether to fail closed when there is no subscription row. */
  requireSubscription: boolean;
}

export interface EntitlementDecision {
  entitled: boolean;
  reason?: "no_subscription" | "inactive_status" | "throttled";
}

/** Pure decision — unit-testable without a database. */
export function decideEntitlement(input: EntitlementInput): EntitlementDecision {
  if (input.status === null) {
    return input.requireSubscription
      ? { entitled: false, reason: "no_subscription" }
      : { entitled: true };
  }
  if (input.throttled) return { entitled: false, reason: "throttled" };
  if (!ENTITLED_STATUSES.includes(input.status as (typeof ENTITLED_STATUSES)[number])) {
    return { entitled: false, reason: "inactive_status" };
  }
  return { entitled: true };
}

/**
 * Is this org entitled to make an AI call? Best-effort: on a DB error it fails
 * OPEN (entitled) so a transient lookup failure never strands the clinical
 * fleet — the cost guardrails (throttle reconciliation) remain the hard cap.
 */
export async function isOrgAiEntitled(
  organizationId: string,
): Promise<EntitlementDecision> {
  const requireSubscription = process.env.AI_REQUIRE_SUBSCRIPTION === "true";
  try {
    const sub = await prisma.practiceSubscription.findUnique({
      where: { organizationId },
      select: { status: true, throttled: true },
    });
    return decideEntitlement({
      status: sub?.status ?? null,
      throttled: sub?.throttled ?? false,
      requireSubscription,
    });
  } catch {
    return { entitled: true };
  }
}
