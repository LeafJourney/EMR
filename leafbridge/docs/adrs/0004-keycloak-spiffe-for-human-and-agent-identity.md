# ADR 0004 — Keycloak (humans) + SPIFFE (agents) for identity

**Status:** Accepted
**Date:** 2026-05-19

## Context

Architectural invariant #4: agent identity is distinct from human identity.
Agents are non-human workforce members with their own scoped tokens,
allowed tools, and autonomy tiers.

## Decision

- **Humans** authenticate via Keycloak (OIDC + optional SAML). MFA is
  required for any account with admin or write-back permissions.
- **Agents** authenticate via SPIFFE / SPIRE. Each agent gets a SVID with
  a workload identity that names the agent slug + the tenant. Tools are
  brokered through Layer 3 — agents cannot mint their own credentials.

## Consequences

- Layer 3 gates both identity sources. Service code never branches on
  "is this a human or an agent" — both are subjects in the OPA policy.
- Token TTLs are aggressive: human session ≤ 8h, agent SVID ≤ 1h.
- Audit emits a different `agent_type` (`human` / `agent` / `system`)
  per subject class so the audit ledger is trivially partitioned.
- Trade-off: SPIFFE/SPIRE operates a control plane. We accept the
  operational cost because mixing agent and human identity in Keycloak
  would make policy authoring much harder.
