"use server";

/**
 * EMR-1139 — one-click remediation server action for the Pre-Flight
 * Claims Dashboard (red-text spec, RCM Phase 6).
 *
 * Flow (mirrors the ops/billing + ops/queue mutation pattern: requireUser →
 * role gate → org-scoped load → mutate → append-only AuditLog → revalidate):
 *
 *   1. Re-load the claim org-scoped and re-run the pre-flight engine
 *      server-side — the client's requested fix is validated against the
 *      CURRENT findings, never trusted blindly.
 *   2. `remediateAndRescore` applies the typed RemediationAction and
 *      re-scores (fix → re-run → green loop).
 *   3. Persist the updated service lines back into Claim.cptCodes; a claim
 *      that re-scores into the green zone (< 0.10) is promoted to "ready"
 *      so the submission pipeline picks it up.
 *   4. Write an append-only AuditLog row with the before/after scores.
 *
 * Only machine-applicable actions are accepted (append_modifier,
 * remove_line). Documentation fixes stay human-in-the-loop: persisting
 * engine-injected keywords into a clinical note would fabricate
 * documentation, so those findings render as guidance only.
 */

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  remediateAndRescore,
  runPreflight,
  PAYER_WINDOW_DAYS,
  type Disposition,
  type RemediationAction,
  type RootCauseFinding,
} from "@/lib/billing/preflight";
import {
  PREFLIGHT_CANDIDATE_STATUSES,
  displayCode,
  groupPayerHistory,
  payerKey,
  pickEncounterNarrative,
  serviceLinesToCptJson,
  toPreflightClaim,
} from "./helpers";

// Same role set the operator layout admits (mirrors the ops/queue action
// allowlist pattern) — mutations are gated like every other operator write.
const PREFLIGHT_MUTATION_ROLES = new Set(["operator", "practice_owner", "system"]);

const remediationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("append_modifier"),
    claimId: z.string().min(1),
    targetCode: z.string().min(1).max(10),
    modifier: z.enum(["25", "59"]),
  }),
  z.object({
    kind: z.literal("remove_line"),
    claimId: z.string().min(1),
    componentCode: z.string().min(1).max(10),
  }),
]);

export type RemediationInput = z.infer<typeof remediationSchema>;

export type RemediationResult =
  | {
      ok: true;
      beforeScore: number;
      afterScore: number;
      afterDisposition: Disposition;
      released: boolean;
      findings: RootCauseFinding[];
      cptDisplay: string[];
      message: string;
    }
  | { ok: false; error: string };

export async function applyPreflightRemediation(
  input: RemediationInput,
): Promise<RemediationResult> {
  const user = await requireUser();
  const organizationId = user.organizationId;
  if (!organizationId) return { ok: false, error: "No organization in session." };
  if (!user.roles.some((r) => PREFLIGHT_MUTATION_ROLES.has(r))) {
    return { ok: false, error: "You don't have permission to remediate claims." };
  }

  const parsed = remediationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid remediation request." };
  }
  const payload = parsed.data;

  // Org-scoped load; only pre-submission claims can be remediated.
  const claim = await prisma.claim.findFirst({
    where: {
      id: payload.claimId,
      organizationId,
      status: { in: [...PREFLIGHT_CANDIDATE_STATUSES] },
    },
    select: {
      id: true,
      status: true,
      payerName: true,
      payerId: true,
      providerId: true,
      serviceDate: true,
      cptCodes: true,
      icd10Codes: true,
      encounter: {
        select: {
          notes: {
            select: { status: true, narrative: true, blocks: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
            take: 5,
          },
        },
      },
    },
  });
  if (!claim) {
    return { ok: false, error: "Claim not found or already submitted." };
  }

  // Rebuild the engine inputs exactly as the page does.
  const preflightClaim = toPreflightClaim(claim);
  const context = {
    narrativeNote: pickEncounterNarrative(claim.encounter?.notes ?? []),
    providerId: claim.providerId,
  };

  const asOf = new Date();
  let payerHistory: ReturnType<typeof groupPayerHistory> = new Map();
  if (claim.payerName) {
    const cutoff = new Date(asOf.getTime() - PAYER_WINDOW_DAYS * 86_400_000);
    const adjudicated = await prisma.claim.findMany({
      where: {
        organizationId,
        status: { in: ["paid", "denied", "partial"] },
        payerName: { equals: claim.payerName, mode: "insensitive" },
        OR: [{ paidAt: { gte: cutoff } }, { deniedAt: { gte: cutoff } }],
      },
      select: {
        payerName: true,
        payerId: true,
        status: true,
        cptCodes: true,
        paidAt: true,
        deniedAt: true,
      },
      take: 2000,
    });
    payerHistory = groupPayerHistory(adjudicated);
  }
  const options = {
    asOf,
    payerHistory: payerHistory.get(payerKey(claim.payerName) ?? "") ?? [],
  };

  // Validate the requested fix against the CURRENT findings — if the claim
  // changed since the page rendered, the fix may no longer apply.
  const current = runPreflight(preflightClaim, context, options);
  const matching = current.findings.find((f) => actionMatches(f.action, payload));
  if (!matching) {
    return {
      ok: false,
      error: "This fix no longer applies to the claim — refresh the worklist.",
    };
  }

  // Fix → re-run → (hopefully) green.
  const run = remediateAndRescore(preflightClaim, context, matching.action, options);

  const released = run.released;
  const actionLabel =
    payload.kind === "append_modifier"
      ? `Appended Modifier-${payload.modifier} to ${payload.targetCode}`
      : `Removed bundled line ${payload.componentCode}`;

  // Persist the remediated codes + append-only audit trail atomically.
  await prisma.$transaction([
    prisma.claim.update({
      where: { id: claim.id },
      data: {
        cptCodes: serviceLinesToCptJson(
          run.claim.serviceLines,
        ) as Prisma.InputJsonValue,
        // Green-zone claims are released to the submission pipeline.
        ...(released ? { status: "ready" } : {}),
        // Every one-click fix is a human intervention on the claim.
        humanTouches: { increment: 1 },
      },
    }),
    prisma.auditLog.create({
      data: {
        organizationId,
        actorUserId: user.id,
        action: "billing.preflight.remediate",
        subjectType: "Claim",
        subjectId: claim.id,
        metadata: {
          remediation: payload,
          findingCategory: matching.category,
          beforeScore: run.before.score.score,
          beforeDisposition: run.before.score.disposition,
          afterScore: run.after.score.score,
          afterDisposition: run.after.score.disposition,
          released,
          payerName: claim.payerName,
        },
      },
    }),
  ]);

  revalidatePath("/ops/preflight");

  return {
    ok: true,
    beforeScore: run.before.score.score,
    afterScore: run.after.score.score,
    afterDisposition: run.after.score.disposition,
    released,
    findings: run.after.findings,
    cptDisplay: run.claim.serviceLines.map(displayCode),
    message: released
      ? `${actionLabel} — P(denial) dropped into the green zone. Released to submission.`
      : `${actionLabel} — claim re-scored.`,
  };
}

function actionMatches(action: RemediationAction, payload: RemediationInput): boolean {
  if (payload.kind === "append_modifier") {
    return (
      action.kind === "append_modifier" &&
      action.targetCode === payload.targetCode &&
      action.modifier === payload.modifier
    );
  }
  return (
    action.kind === "remove_line" && action.componentCode === payload.componentCode
  );
}
