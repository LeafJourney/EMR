# ADR-007: Policy decisions are first-class, logged, and explainable

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
Many decisions in the system — who can view a chart, whether an agent
output is allowed to write back, whether a prescription can be filled —
are subject to state, federal, and payer rules. Burying these decisions
in inline `if` statements makes them invisible to reviewers and
impossible to audit.

## Decision
Every policy decision routes through a named policy evaluator that
returns `{ decision: "allow" | "deny", reasons: PolicyReason[] }`. The
evaluator decision is persisted on the request that triggered it
(or as a `PolicyDecisionLog` row when not request-bound).

## Consequences
- Pro: every "no" has a citation; every "yes" has a trail.
- Pro: compliance reviewers can read the rules without reading code.
- Con: adding a policy is more ceremony than a one-line `if`.
- Con: latency overhead per evaluator (mitigated by memoization).

## Alternatives considered
- Inline guards. Rejected: not auditable.
- OPA / Rego sidecar. Deferred: viable, but extra moving part.
