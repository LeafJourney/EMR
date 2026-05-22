# audit-service

Append-only `AuditEvent` persistence. Every service in the platform emits
AuditEvents through this service. The store is tamper-evident (Merkle-chained
batches, signed roots).

## Schema

See [docs/architecture/data-model.md#auditevent](../../docs/architecture/data-model.md#auditevent)
for the canonical AuditEvent shape. The service stores both the FHIR
AuditEvent resource (Gold) and a relational projection (Platinum) for
search.

## Query surface

- `GET /AuditEvent?patient=...&period=...` — patient timeline
- `GET /AuditEvent?agent=...&period=...` — agent activity
- `GET /AuditEvent?user=...&period=...` — user activity
- `GET /AuditEvent/_history/{id}` — event by id (immutable)

## Retention

Default 7 years. Tenant override is allowed via configuration but never
below the regulatory floor.
