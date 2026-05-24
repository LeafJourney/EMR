# fhir-server-adapter

**Module 2.** Persists canonical FHIR JSON, runs US Core profile validation,
maintains resource versions, exposes basic search, and writes AuditEvents.

## Backed by

- HAPI FHIR server (`localhost:8080`) for canonical storage
- Postgres relational projections for query (one table per Tier A resource)
- Audit-service for every read + write

## Contracts

- FHIR R4 base spec (read / vread / search / create / update / delete)
- US Core 6.1.0 profiles for Tier A resources (Patient, Encounter, etc.)
- `$validate` operation enforces profile constraints synchronously

## Invariants

- Source FHIR JSON is the canonical truth. Relational projection is a cache.
- Every write emits Provenance + AuditEvent.
- No PHI is logged in error messages — refer to AuditEvent IDs instead.
