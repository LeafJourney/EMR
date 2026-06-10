// EMR-960 — pure resolution logic for owner default approve/reject decisions.
//
// No Prisma / server-only import so it is unit-testable and reusable by the
// orchestration approval gate (separate track). DB accessors live in
// ./approval-defaults.ts.

export type ApprovalDecisionScope = "agent" | "workflow";
export type ApprovalDecision = "approve" | "reject";

export interface DecisionRule {
  scopeType: ApprovalDecisionScope;
  scopeKey: string;
  decision: ApprovalDecision;
  enabled: boolean;
  note?: string | null;
}

export interface JobMatchContext {
  agentName?: string | null;
  workflowName?: string | null;
}

export interface ResolvedDecision {
  decision: ApprovalDecision;
  rule: DecisionRule;
}

/**
 * Resolve the default decision for a job from an org's rule set, or null when
 * nothing matches (→ the job goes to the normal Needs-Approval queue).
 *
 * Precedence: an enabled `workflow` rule matching the job's workflow wins over
 * an `agent` rule. A workflow is a more specific operator intent ("auto-approve
 * THIS workflow") than a blanket per-agent default. Disabled rules never apply.
 */
export function resolveDefaultDecision(
  rules: DecisionRule[],
  ctx: JobMatchContext,
): ResolvedDecision | null {
  const active = rules.filter((r) => r.enabled);

  if (ctx.workflowName) {
    const wf = active.find(
      (r) => r.scopeType === "workflow" && r.scopeKey === ctx.workflowName,
    );
    if (wf) return { decision: wf.decision, rule: wf };
  }

  if (ctx.agentName) {
    const ag = active.find(
      (r) => r.scopeType === "agent" && r.scopeKey === ctx.agentName,
    );
    if (ag) return { decision: ag.decision, rule: ag };
  }

  return null;
}
