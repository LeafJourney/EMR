# policy-gateway

**Module 5b.** Policy Decision Point and Policy Enforcement Point for every
data access in LeafBridge. Reads consent state from
[consent-service](../consent-service/) and runs OPA policies against the
inbound request.

## Authorization model

- **RBAC** — human roles (`practitioner`, `clinical-staff`, `billing`, `admin`)
- **ABAC roadmap** — attributes carried in the JWT / SVID claims:
  - `tenant_id`
  - `purpose_of_use` (`treatment`, `payment`, `operations`, `research`, `disclosure`)
  - `data_classes` (allowed) for agents
  - `autonomy_tier` (0–5) for agents
- **Min-necessary filter** — agent retrieval is pre-filtered by
  `allowed_data_classes` before the FHIR query runs
- **Write-back gate** — agent writes are blocked unless the practice's
  `writeback_policy` permits the resource and the autonomy tier

## Policies live in

`./policies/` — OPA Rego files, loaded by the OPA container at startup.
Tests under `./policies/__tests__/` use `opa test`.

## Audit emission

Every decision (allow / deny) emits AuditEvent with the policy decision and
the inputs that drove it.
