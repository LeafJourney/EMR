/**
 * @leafbridge/workflow-sdk
 *
 * Phase 0 — routing-rule evaluator. Given a parsed FHIR resource and a list
 * of clinical_routing_rules from the Specialty Template + practice
 * override, return the route(s) that fire.
 */

import type { ClinicalRoutingRule } from "@leafbridge/specialty-dsl";

export type RoutingMatch = {
  rule: ClinicalRoutingRule;
  routedTo: string;
  priority: "routine" | "high" | "urgent" | "stat";
  triggerAgent: string | null;
};

/**
 * Returns every rule that matches `resource`. Caller decides whether to
 * fire only the first match or fan out to every match.
 */
export function evaluateRoutingRules(
  resource: { resourceType: string; code?: { coding?: { code?: string }[] }; valueQuantity?: { value?: number }; status?: string },
  rules: readonly ClinicalRoutingRule[],
): RoutingMatch[] {
  const matches: RoutingMatch[] = [];
  for (const rule of rules) {
    if (rule.when.resource !== resource.resourceType) continue;
    const codes = resource.code?.coding?.map((c) => c.code).filter(Boolean) ?? [];
    if (!codes.includes(rule.when.code)) continue;
    if (!evaluatePredicate(resource, rule.when.predicate)) continue;
    matches.push({
      rule,
      routedTo: rule.then.route_to,
      priority: rule.then.priority,
      triggerAgent: rule.then.trigger_agent ?? null,
    });
  }
  return matches;
}

function evaluatePredicate(
  resource: { valueQuantity?: { value?: number }; status?: string },
  predicate: NonNullable<ClinicalRoutingRule["when"]["predicate"]>,
): boolean {
  if (predicate.value_greater_than !== undefined) {
    const v = resource.valueQuantity?.value;
    if (v === undefined || !(v > predicate.value_greater_than)) return false;
  }
  if (predicate.value_less_than !== undefined) {
    const v = resource.valueQuantity?.value;
    if (v === undefined || !(v < predicate.value_less_than)) return false;
  }
  if (predicate.status_equal_to !== undefined) {
    if (resource.status !== predicate.status_equal_to) return false;
  }
  return true;
}
