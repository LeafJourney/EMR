// EMR-960 — owner default approve/reject decision accessors (server-side).
//
// The orchestration approval gate (separate track) should call
// `resolveDefaultDecisionForOrg` when a job would otherwise enter the
// Needs-Approval queue, and auto-apply the returned decision (with a per-job
// audit entry) when one is found.

import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  type ApprovalDecision,
  type ApprovalDecisionScope,
  type DecisionRule,
  type JobMatchContext,
  type ResolvedDecision,
  resolveDefaultDecision,
} from "./approval-defaults-logic";

export {
  resolveDefaultDecision,
  type ApprovalDecision,
  type ApprovalDecisionScope,
  type DecisionRule,
  type JobMatchContext,
  type ResolvedDecision,
};

/** All rules for an org, normalized to the pure `DecisionRule` shape. */
export async function listApprovalDefaults(
  organizationId: string,
): Promise<DecisionRule[]> {
  const rows = await prisma.defaultApprovalDecision.findMany({
    where: { organizationId },
    orderBy: [{ scopeType: "asc" }, { scopeKey: "asc" }],
  });
  return rows.map((r) => ({
    scopeType: r.scopeType,
    scopeKey: r.scopeKey,
    decision: r.decision,
    enabled: r.enabled,
    note: r.note,
  }));
}

/** Resolve the default decision for a job in one org (or null → normal queue). */
export async function resolveDefaultDecisionForOrg(
  organizationId: string,
  ctx: JobMatchContext,
): Promise<ResolvedDecision | null> {
  if (!organizationId) return null;
  const rules = await listApprovalDefaults(organizationId);
  return resolveDefaultDecision(rules, ctx);
}

export interface UpsertApprovalDefaultInput {
  organizationId: string;
  scopeType: ApprovalDecisionScope;
  scopeKey: string;
  decision: ApprovalDecision;
  enabled?: boolean;
  note?: string | null;
  createdById?: string | null;
}

/** Create or update one default-decision rule (unique per org+scopeType+scopeKey). */
export async function upsertApprovalDefault(input: UpsertApprovalDefaultInput) {
  const { organizationId, scopeType, scopeKey, decision, enabled, note, createdById } = input;
  return prisma.defaultApprovalDecision.upsert({
    where: {
      organizationId_scopeType_scopeKey: { organizationId, scopeType, scopeKey },
    },
    update: { decision, enabled: enabled ?? true, note: note ?? null },
    create: {
      organizationId,
      scopeType,
      scopeKey,
      decision,
      enabled: enabled ?? true,
      note: note ?? null,
      createdById: createdById ?? null,
    },
  });
}

/** Delete a rule, scoped to its org so a stray id can't reach across tenants. */
export async function deleteApprovalDefault(organizationId: string, id: string) {
  return prisma.defaultApprovalDecision.deleteMany({ where: { id, organizationId } });
}
