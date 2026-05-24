# Architecture principles

Hard constraints that govern every change to LeafBridge. Violations require
an ADR.

## 1. Never overwrite source truth

Bronze (raw) is immutable. Silver, Gold, Platinum, and Vector projections
derive from Bronze. Re-deriving must be reproducible from the source artifact
plus the registered transformation version.

## 2. No naked prompts

Every AI agent output must cite patient-specific source data via the RAG
service. Outputs without an `evidence[]` populated are rejected by the
orchestrator before they reach the human reviewer.

## 3. Consent-aware retrieval is enforced at the data layer

The policy-gateway sits between every retrieval call and FHIR storage. App
layer code does not call FHIR storage directly. Bypass paths do not exist.

## 4. Agent identity is distinct from human identity

Agents are non-human workforce members with their own scoped tokens, allowed
tools, allowed data classes, and autonomy tiers. Human identity flows via
OIDC. Agent identity flows via SPIFFE / SVIDs.

## 5. No silent autonomous clinical write-back

Every write to a chart goes through the human review queue unless the
practice's `writeback_policy` permits the resource + the agent's autonomy
tier is within `max_autonomy_tier`.

## 6. Tenant isolation by design

Every Postgres table either:

- Carries a `tenant_id` column enforced by row-level security, or
- Lives in a per-tenant schema, or
- Lives in a per-tenant Kubernetes namespace.

App-layer-only isolation is forbidden.

## 7. Three persistence representations per FHIR resource

- **Canonical JSON** — source-of-truth FHIR R4
- **Relational projection** — flattened Postgres tables for OLTP query
- **AI retrieval projection** — vector index + structured metadata

The projections are derived from the canonical record. Drift between them is
a bug.

## 8. Minimum-necessary retrieval

Agent retrieval is filtered by `allowed_data_classes` *before* the index
query runs. Filtering after retrieval is forbidden — the policy must shape
the query, not the result.

## 9. Specialty differences are configuration, not forks

Specialty differences (Internal Medicine vs Pain Management vs Cannabis
Medicine) live in the Specialty Template manifest, the Practice
Configuration, and the LeafBridge extensions (`agents[]`,
`clinical_routing_rules[]`, `writeback_policy`). No `if (specialty === ...)`
branches in service code.

## 10. Audit everything

Every state-changing call emits an AuditEvent. Every retrieval call emits an
AuditEvent. Every agent prompt + tool call + source data + output is
captured. AuditEvent storage is append-only with tamper-evident chaining.

## See also

- [Data model](data-model.md)
- [Lakehouse zones](lakehouse-zones.md)
- [Security model](../security/security-model.md)
- [ADRs](../adrs/)
