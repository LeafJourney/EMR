import type {
  AccessAction,
  AccessRequest,
  AgentPolicy,
  PolicyBundle,
  RolePolicy,
} from "./types";

/**
 * Pure policy evaluator. Given a subject, the policies that apply to
 * that subject, and a request, returns either an allow or a structured
 * deny with a code the caller can audit.
 *
 * Two cohorts of policy:
 *   • RolePolicy applies to human users (matched by role).
 *   • AgentPolicy applies to AI agents (matched by id, with `*` wildcard).
 */
export interface PolicyEvalAllow {
  allowed: true;
  /** Data classes the matched policy actually permits (subset of request). */
  allowedDataClasses: readonly AccessRequest["dataClasses"][number][];
}

export interface PolicyEvalDeny {
  allowed: false;
  code:
    | "no-role-policy"
    | "no-agent-policy"
    | "tier-exceeded"
    | "purpose-forbidden"
    | "action-forbidden"
    | "data-class-forbidden"
    | "not-on-care-team";
  reason: string;
}

export type PolicyEvalResult = PolicyEvalAllow | PolicyEvalDeny;

export function evaluatePolicy(
  bundle: PolicyBundle,
  request: AccessRequest,
): PolicyEvalResult {
  if (request.subject.kind === "user") {
    return evaluateUserPolicy(bundle.rolePolicies, request);
  }
  return evaluateAgentPolicy(bundle.agentPolicies, request);
}

function evaluateUserPolicy(
  policies: readonly RolePolicy[],
  request: AccessRequest,
): PolicyEvalResult {
  if (request.subject.kind !== "user") {
    return { allowed: false, code: "no-role-policy", reason: "Not a user subject" };
  }
  const subject = request.subject;
  const policy = policies.find((p) => p.role === subject.role);
  if (!policy) {
    return {
      allowed: false,
      code: "no-role-policy",
      reason: `No role policy for ${subject.role}`,
    };
  }
  if (!policy.allowedPurposes.includes(request.purposeOfUse)) {
    return {
      allowed: false,
      code: "purpose-forbidden",
      reason: `Role ${subject.role} cannot claim purpose ${request.purposeOfUse}`,
    };
  }
  const actionCheck = checkAction(policy.allowedActions, request.action);
  if (actionCheck) return actionCheck;

  const allowed = request.dataClasses.filter((c) => policy.allowedDataClasses.includes(c));
  if (allowed.length === 0) {
    return {
      allowed: false,
      code: "data-class-forbidden",
      reason: `Role ${subject.role} cannot access ${request.dataClasses.join(",")}`,
    };
  }

  if (policy.requireCareTeamForTreatment && request.purposeOfUse === "treatment") {
    const onTeam = (subject.careTeamPatientIds ?? []).includes(request.patientId);
    if (!onTeam) {
      return {
        allowed: false,
        code: "not-on-care-team",
        reason: `User ${subject.id} is not on the care team for patient ${request.patientId}`,
      };
    }
  }

  return { allowed: true, allowedDataClasses: allowed };
}

function evaluateAgentPolicy(
  policies: readonly AgentPolicy[],
  request: AccessRequest,
): PolicyEvalResult {
  if (request.subject.kind !== "agent") {
    return { allowed: false, code: "no-agent-policy", reason: "Not an agent subject" };
  }
  const subject = request.subject;
  // Specific id beats wildcard; if neither, deny.
  const policy =
    policies.find((p) => p.agentId === subject.id) ??
    policies.find((p) => p.agentId === "*");
  if (!policy) {
    return {
      allowed: false,
      code: "no-agent-policy",
      reason: `No agent policy for ${subject.id}`,
    };
  }
  if (subject.autonomyTier > policy.maxTier) {
    return {
      allowed: false,
      code: "tier-exceeded",
      reason: `Agent ${subject.id} runtime tier ${subject.autonomyTier} exceeds policy ceiling ${policy.maxTier}`,
    };
  }
  if (!policy.allowedPurposes.includes(request.purposeOfUse)) {
    return {
      allowed: false,
      code: "purpose-forbidden",
      reason: `Agent ${subject.id} cannot claim purpose ${request.purposeOfUse}`,
    };
  }
  const actionCheck = checkAction(policy.allowedActions, request.action);
  if (actionCheck) return actionCheck;

  const allowed = request.dataClasses.filter((c) => policy.allowedDataClasses.includes(c));
  if (allowed.length === 0) {
    return {
      allowed: false,
      code: "data-class-forbidden",
      reason: `Agent ${subject.id} cannot access ${request.dataClasses.join(",")}`,
    };
  }
  return { allowed: true, allowedDataClasses: allowed };
}

function checkAction(
  allowed: readonly AccessAction[],
  requested: AccessAction,
): PolicyEvalDeny | null {
  if (allowed.includes(requested)) return null;
  return {
    allowed: false,
    code: "action-forbidden",
    reason: `Action ${requested} not in policy`,
  };
}
