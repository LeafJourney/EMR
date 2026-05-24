# ADR 0005 — OPA as the policy decision point

**Status:** Accepted
**Date:** 2026-05-19

## Context

Every data access — read or write — must run through a policy decision.
Authorization considers RBAC (role) plus ABAC (purpose-of-use, data class,
autonomy tier, tenant, sensitivity tags).

## Decision

[Open Policy Agent](https://www.openpolicyagent.org/) is the Policy Decision
Point. The policy-gateway service is the Policy Enforcement Point — it
calls OPA on every request and refuses to forward the call if OPA denies.

Policies live in `services/policy-gateway/policies/` as Rego files and are
versioned in-repo. Tests use `opa test`.

## Consequences

- Policy authoring is in Rego — readable by security-side reviewers
- Cross-cutting policies (write-back ceiling per autonomy tier, consent
  filters) live in one place
- The policy bundle is signed and pinned at startup; runtime policy
  changes require a deploy
- Trade-off: Rego is its own language. We accept the learning cost
  because the alternative (policy logic in app code) is impossible to
  audit
