// EMR-756 — Per-practice cost guardrails (soft + hard caps).
//
// The AI broker ([[EMR-754]]) routes every model call through `invoke()`.
// Practices that exceed their token allowance need to be throttled
// before the spend gets out of hand. The contract:
//
//   - Soft cap (90% of allowance): the anomaly detector emits an
//     `approaching_token_cap` anomaly. No call rejection.
//   - Hard cap (110% of allowance): the broker short-circuits with a
//     structured 429.
//
// The state that drives the broker short-circuit is the
// PracticeSubscription.throttled boolean. This module exposes:
//
//   - reconcileThrottleState(): the function the cron / detector runs on
//     a schedule to flip `throttled` based on usage vs. allowance.
//   - setManualOverride(): operator action to force `throttled` on/off,
//     requiring a reason that is persisted on the subscription row AND
//     to the ControllerAuditLog as `super_admin.cost_cap_override`.

import "server-only";

import type { PrismaClient } from "@prisma/client";
import { logControllerAction } from "@/lib/auth/audit-stub";
import type { AuthedUser } from "@/lib/auth/session";

export const SOFT_CAP_PCT = 0.9;
export const HARD_CAP_PCT = 1.1;

export type GuardrailStatus =
  | "ok"
  | "approaching_token_cap"
  | "throttled";

export interface GuardrailEvaluation {
  status: GuardrailStatus;
  usedTokensMTD: number;
  includedMonthlyTokens: number | null;
  /** Ratio used / included. Null when no allowance is enforced. */
  utilization: number | null;
}

/**
 * Pure decision: given MTD usage and the org's monthly allowance, return
 * the guardrail status. Exported separately for unit tests so a single
 * test can cover the threshold logic without a DB.
 */
export function decideGuardrailStatus(args: {
  usedTokensMTD: number;
  includedMonthlyTokens: number | null;
}): GuardrailEvaluation {
  const { usedTokensMTD, includedMonthlyTokens } = args;
  if (
    includedMonthlyTokens === null ||
    includedMonthlyTokens === undefined ||
    includedMonthlyTokens <= 0
  ) {
    return {
      status: "ok",
      usedTokensMTD,
      includedMonthlyTokens: includedMonthlyTokens ?? null,
      utilization: null,
    };
  }
  const utilization = usedTokensMTD / includedMonthlyTokens;
  let status: GuardrailStatus = "ok";
  if (utilization >= HARD_CAP_PCT) status = "throttled";
  else if (utilization >= SOFT_CAP_PCT) status = "approaching_token_cap";
  return {
    status,
    usedTokensMTD,
    includedMonthlyTokens,
    utilization,
  };
}

/**
 * Recompute the guardrail state for one organization and apply it to the
 * PracticeSubscription row. The cron should call this for every active
 * subscription on a schedule (every 5 minutes is plenty given our
 * call volumes).
 *
 * Returns the evaluation and whether the throttled flag was flipped on
 * this call, so the cron can emit anomalies + log when state changes.
 */
export async function reconcileThrottleState(args: {
  prisma: PrismaClient;
  organizationId: string;
  usedTokensMTD: number;
}): Promise<GuardrailEvaluation & { flipped: boolean }> {
  const { prisma, organizationId, usedTokensMTD } = args;

  // Reach through `unknown` because PracticeSubscription was added in
  // EMR-751 and may not yet be in older generated clients. Once everyone
  // is on the new schema, this becomes `prisma.practiceSubscription`.
  const delegate = (prisma as unknown as Record<string, unknown>)[
    "practiceSubscription"
  ] as
    | undefined
    | {
        findUnique: (args: {
          where: { organizationId: string };
          select: { includedMonthlyTokens: true; throttled: true; overrideReason: true };
        }) => Promise<{
          includedMonthlyTokens: number | null;
          throttled: boolean;
          overrideReason: string | null;
        } | null>;
        update: (args: {
          where: { organizationId: string };
          data: { throttled: boolean };
        }) => Promise<unknown>;
      };

  if (!delegate) {
    return {
      status: "ok",
      usedTokensMTD,
      includedMonthlyTokens: null,
      utilization: null,
      flipped: false,
    };
  }

  const sub = await delegate.findUnique({
    where: { organizationId },
    select: {
      includedMonthlyTokens: true,
      throttled: true,
      overrideReason: true,
    },
  });
  if (!sub) {
    return {
      status: "ok",
      usedTokensMTD,
      includedMonthlyTokens: null,
      utilization: null,
      flipped: false,
    };
  }

  const evaluation = decideGuardrailStatus({
    usedTokensMTD,
    includedMonthlyTokens: sub.includedMonthlyTokens,
  });
  const shouldThrottle = evaluation.status === "throttled";

  // Honor manual overrides — an operator who explicitly disabled throttling
  // takes precedence over automatic reconciliation.
  if (sub.overrideReason && sub.overrideReason.startsWith("manual_disable_")) {
    return { ...evaluation, flipped: false };
  }

  const flipped = shouldThrottle !== sub.throttled;
  if (flipped) {
    await delegate.update({
      where: { organizationId },
      data: { throttled: shouldThrottle },
    });
  }

  return { ...evaluation, flipped };
}

/**
 * Operator-driven override. Writes the override fields on the
 * subscription row AND an audit log entry. The `reason` is required and
 * persisted so the override is traceable.
 *
 * `mode` `disable` forces `throttled = false` regardless of usage.
 * `mode` `enable` forces `throttled = true` to give ops a kill switch.
 */
export async function setManualOverride(args: {
  prisma: PrismaClient;
  organizationId: string;
  mode: "disable" | "enable" | "clear";
  reason: string;
  actor: Pick<AuthedUser, "id" | "email" | "roles" | "organizationId">;
}): Promise<void> {
  const { prisma, organizationId, mode, reason, actor } = args;
  if (mode !== "clear" && reason.trim().length < 4) {
    throw new Error("override reason is required");
  }

  const delegate = (prisma as unknown as Record<string, unknown>)[
    "practiceSubscription"
  ] as
    | undefined
    | {
        update: (args: {
          where: { organizationId: string };
          data: {
            throttled?: boolean;
            overrideReason?: string | null;
            overrideSetAt?: Date | null;
            overrideSetByUserId?: string | null;
          };
        }) => Promise<unknown>;
      };
  if (!delegate) {
    throw new Error("PracticeSubscription model not generated");
  }

  if (mode === "clear") {
    await delegate.update({
      where: { organizationId },
      data: {
        overrideReason: null,
        overrideSetAt: null,
        overrideSetByUserId: null,
      },
    });
  } else {
    const prefix = mode === "disable" ? "manual_disable_" : "manual_enable_";
    await delegate.update({
      where: { organizationId },
      data: {
        throttled: mode === "enable",
        overrideReason: `${prefix}${reason}`,
        overrideSetAt: new Date(),
        overrideSetByUserId: actor.id,
      },
    });
  }

  await logControllerAction({
    actor,
    action: "super_admin.cost_cap_override",
    targetId: organizationId,
    reason,
    after: { mode },
  }).catch(() => {
    // Audit is best-effort; the override has already been applied.
  });
}
