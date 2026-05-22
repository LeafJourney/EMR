# Security model — Phase 0.4 (EMR-774)

LeafBridge processes Protected Health Information. This document is the
binding contract for every contributor: any change that touches data
access, identity, or audit must be reviewed against this model.

Aligns with [NIST SP 800-207 Zero Trust Architecture](https://csrc.nist.gov/publications/detail/sp/800-207/final).

## Guiding principles

1. **Minimum necessary access** — every retrieval is shaped by the caller's
   allowed data classes before the index is queried
2. **Consent-aware retrieval** — policy-gateway checks consent state per
   request; no caching past the request lifetime
3. **Full auditability** — every state-changing call emits an immutable
   AuditEvent; every agent prompt + tool call + source data + output is
   captured
4. **Agent identity** — agents are non-human workforce members with their
   own SVIDs, allowed tools, allowed data classes, autonomy tiers (0–5),
   and escalation rules
5. **Human-in-the-loop for clinical actions** — no autonomous clinical
   write-back in v0.1
6. **No training on PHI without explicit permission** — `do_not_train` tag
   propagates with the data
7. **Data lineage** — every value links back to its source artifact via
   Provenance
8. **Every AI output is grounded** — the citation verifier rejects output
   without source references
9. **No silent autonomous clinical write-back** — every write goes through
   the human review queue unless the practice's `writeback_policy` permits
   the resource and the agent's autonomy tier is within the ceiling
10. **Tenant isolation by design** — three layers of defense at column,
    schema, and namespace

## Identity model

### Humans

- Identity provider: Keycloak (OIDC + SAML)
- Required claims: `sub`, `tenant_id`, `email`, `roles[]`, `purpose_of_use`
- MFA: required for any account with admin or write-back permissions
- Session policies:
  - Idle timeout: 30 minutes
  - Max session: 8 hours
  - Refresh token rotation: every issue
- Token type: short-lived JWT (5 min) + refresh

### Agents

- Identity provider: SPIFFE / SPIRE
- SVID: short-lived (≤ 1 hour) X.509 cert with the SPIFFE ID
  `spiffe://leafbridge/agent/{slug}/{tenant_id}`
- Service-to-service: mTLS using the SVIDs
- Agent metadata (allowed_tools, allowed_data_classes, autonomy_tier,
  purpose_of_use) is loaded from the Specialty Template manifest at
  request time and re-validated on every retrieval

### Services

- Service-to-service: mTLS via SPIFFE
- Each service has its own SPIFFE ID:
  `spiffe://leafbridge/service/{service-name}`
- The policy-gateway is the only service authorized to call the
  consent-service for consent state

## Authorization model

### RBAC

Human roles (configurable per tenant):

| Role | Purpose-of-use defaults |
| -- | -- |
| `practitioner` | treatment, payment |
| `clinical-staff` | treatment, operations |
| `billing` | payment, operations |
| `admin` | operations |
| `auditor` | operations (read-only on AuditEvent) |
| `patient` | treatment (their own record only) |

### ABAC overlay

Attributes carried in JWT / SVID claims and used by OPA:

- `tenant_id` — enforced on every query
- `purpose_of_use` — HL7 PurposeOfUse code (`treatment`, `payment`,
  `operations`, `research`, `public-health`, `disclosure`, `emergency`,
  `patient-request`)
- `data_classes` (agents only) — allowed list, enforced at retrieval
- `autonomy_tier` (agents only) — 0–5

### OPA policy structure

```rego
package leafbridge.authz

# Default deny
default allow := false

# Human read
allow {
  input.subject.type == "human"
  input.subject.tenant_id == input.resource.tenant_id
  input.action == "read"
  input.subject.purpose_of_use in valid_purposes_for_role[input.subject.roles[_]]
  consent_permits_read(input.resource, input.subject)
}

# Agent read
allow {
  input.subject.type == "agent"
  input.subject.tenant_id == input.resource.tenant_id
  input.action == "read"
  input.resource.data_class in input.subject.allowed_data_classes
  consent_permits_read(input.resource, input.subject)
}

# Agent write-back ceiling
allow {
  input.subject.type == "agent"
  input.action == "write"
  input.resource.type in input.practice.writeback_policy.allowed_resources
  input.subject.autonomy_tier <= input.practice.writeback_policy.max_autonomy_tier
  not input.practice.writeback_policy.requires_approval
}
```

### Min-necessary filter

Agent retrievals are filtered *before* the index call by
`allowed_data_classes`. The filter is enforced in the rag-service via
Qdrant payload filters and in the fhir-server-adapter via JSONB filters.
Post-retrieval filtering is forbidden — the policy must shape the query.

## Audit log requirements

- **Append-only** at the database layer
  (`revoke update, delete on auditevent`)
- **Tamper-evident**: per-row `prev_hash` + `row_hash`, nightly batch seal
  signed by the audit-service KMS key
- **Retention**: 7 years minimum; tenant configurable up only
- **Captured per call**:
  - `recorded_at`, `tenant_id`, `request_id`
  - `agent_type` (`human` | `agent` | `system`)
  - `agent_id`
  - `action` (`C` | `R` | `U` | `D` | `E`)
  - `outcome` (`0` success, `4` minor, `8` serious, `12` major)
  - `source_resource`
  - For agents: full `prompt_blob` (prompt + tool calls + source data +
    output)

## Encryption requirements

| Surface | Requirement |
| -- | -- |
| Network in transit | TLS 1.2+; TLS 1.3 preferred. mTLS via SPIFFE between services. |
| Object storage at rest | AES-256-SSE; per-tenant KMS key in cloud deploys. |
| Database at rest | TDE (Postgres `pg_tde` or cloud-managed equivalent). |
| Vector index at rest | AES-256 disk-level. |
| Backups | AES-256 with KMS-managed key, separate from the live KMS key. |

## Secrets management

- All secrets in Vault (dev: file backend; cloud: cloud KMS-wrapped Vault)
- Rotation:
  - Service account passwords: 30 days
  - Database credentials: 90 days
  - Signing keys: yearly, with overlap window
  - Webhook secrets: on rotation event
- No secrets in env vars in production; services pull from Vault at boot

## DLP / egress controls

- **Log redaction**: every logger wraps fields known to contain PHI (names,
  MRN, DOB) and replaces them with `[REDACTED:<class>]` before serialization
- **Egress monitoring**: outbound HTTP from services is whitelisted via
  Envoy; any request to a non-allowlist destination is blocked + audited
- **"Do not train" tags**: propagate from Bronze through every projection.
  Vector index drops `do_not_train` records from any embedding-export job

## Tenant isolation

Three layers — see [tenant-isolation.md](./tenant-isolation.md):

1. Database column with row-level security
2. Per-tenant schema for sensitive tables (`audit_{tenant}`, `mpi_{tenant}`)
3. Per-tenant Kubernetes namespace + NetworkPolicies

## Backup + restore

- Postgres: continuous WAL archiving + nightly base backup, retained 35 days
- Object storage: versioning enabled, lifecycle rule retains for 7 years
- Iceberg: snapshot history kept indefinitely on Audit zone; ≥ 90 days on
  other zones
- **Restore drills**: monthly; restore a randomly-selected tenant's audit
  zone to a sandbox and run a verification query that proves the Merkle
  chain still validates end-to-end

## Required controls

| Control | Requirement | Test |
| -- | -- | -- |
| Encryption in transit | TLS 1.2+ | `ssllabs` scan + integration test |
| Encryption at rest | AES-256 | infra-as-code review |
| Secrets | Vault / cloud KMS, rotated | rotation log review |
| Identity (humans) | OIDC/SAML | identity provider config audit |
| Identity (agents) | SPIFFE/SPIRE | SVID-issuance log review |
| MFA | Required for admin | Keycloak realm audit |
| Audit logs | Immutable / append-only | DB grant review + Merkle replay |
| Agent logs | Prompt + tool calls + source + output | sample agent run replay |
| PHI minimization | Policy-enforced | retrieval-filter regression test |
| Tenant isolation | DB / schema / namespace | RLS policy test + namespace test |
| Backups | Encrypted, tested restores | monthly restore drill |
| DLP | Redaction + egress monitoring | redaction unit tests + egress proxy log |

## Threat model + IR

See [threat-model.md](./threat-model.md) for STRIDE per-service and
[incident-response.md](./incident-response.md) for the IR runbook skeleton.

## Per-service security profiles

Every MVP service ships with a documented security profile in its own
`SECURITY.md` (auth, data class access, audit emission, network zone).
Phase 0 carries the table; Phase 1+ services fill it in as they ship.

| Service | Auth | Data classes accessed | Audit emission | Network zone |
| -- | -- | -- | -- | -- |
| `ingestion-gateway` | OIDC (humans) + SPIFFE (sources) | demographics, encounters, observations, conditions, medications, labs, documents | every ingest → Bronze | DMZ |
| `fhir-server-adapter` | SPIFFE | all Tier A | every read + write | internal |
| `terminology-service` | SPIFFE | none (codes, not PHI) | translate + lookup | internal |
| `mpi-service` | SPIFFE | demographics | merge/split, link decisions | internal |
| `consent-service` | SPIFFE | consent | consent CRUD | internal |
| `policy-gateway` | SPIFFE | all | every decision (allow / deny) | internal |
| `agent-orchestrator` | SPIFFE | per-agent allowed classes | prompts, tool calls, outputs, decisions | internal |
| `rag-service` | SPIFFE | per-agent allowed classes | retrievals | internal |
| `audit-service` | SPIFFE | audit only | write events; reads emit a read-audit | internal |
| `notification-router` | SPIFFE | none (metadata only) | route decisions | internal |
