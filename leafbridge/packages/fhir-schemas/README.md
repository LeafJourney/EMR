# @leafbridge/fhir-schemas

Zod schemas for the **Tier A** FHIR R4 resources, profiled against
[US Core 6.1.0](https://hl7.org/fhir/us/core/STU6.1/).

Tier A resources (must ship in v0.1):

| Domain | Resource |
| -- | -- |
| Identity | `Patient`, `Practitioner`, `Organization` |
| Encounters | `Encounter` |
| Clinical facts | `Condition`, `Observation` |
| Medications | `MedicationRequest` |
| Labs | `DiagnosticReport` |
| Documents | `DocumentReference`, `Binary` |
| Governance | `Consent`, `Provenance`, `AuditEvent` |

See `docs/implementation-guides/fhir-resources/` for per-resource US Core
profile constraints, required fields, search parameters, and synthetic
examples.

## Status

Phase 0 — the package ships type stubs only. Phase 1 brings the full Zod
schema + US Core conformance test suite.
