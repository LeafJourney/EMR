# Lakehouse query engine

The lakehouse zones (see [lakehouse-zones.md](./lakehouse-zones.md)) describe
*where* data lives. This document describes the **query engine** that serves the
Gold zone and the Audit zone to applications and agents.

The engine is realized in the LeafJourney application at
`src/lib/lakehouse/` as **pure, framework-free TypeScript** — no Prisma, no Next,
no Clerk — exactly like the `leafbridge/fhir-persistence` storage contract it
extends. It can run inside a Next route handler, a worker, a CLI, or a unit test.

## Responsibilities

| Capability | Method | Notes |
| -- | -- | -- |
| Create / update | `ingest(tenant, resource, provenance)` | Upsert; an update appends a new immutable version. |
| Bundle ingest | `ingestBundle(tenant, bundle, provenance)` | Splits a Bundle, per-entry skip reasons. |
| Read | `read(tenant, type, id)` | Current non-deleted version. |
| Version read | `vread(tenant, type, id, versionId)` | Any historical version. |
| History | `history(tenant, type, id)` | Full immutable version stack, newest first. |
| Delete | `remove(tenant, type, id)` | Logical tombstone version + audit event. |
| Search | `search(tenant, type, args, opts)` | String / token / reference / date params, AND-combined, paginated, sorted. |
| Compartment | `everything(tenant, patientId)` | All resources in a patient's compartment. |
| Catalog | `catalog(tenant)` | Zone + resource-type rollups, conformance, sources. |
| Capability | `capabilityStatement(tenant)` | FHIR R4 `CapabilityStatement` of what is served. |

Every state change emits a hash-chained `AuditEntry` (`prevHash` → `rowHash`),
forming the tamper-evident **Audit zone** described in lakehouse-zones.md.
`auditLog.verify(tenant)` re-derives the chain and reports the first broken
link.

## Conformance

`scoreConformance(resource)` inspects a resource's actual R4 JSON and returns a
roll-up (`pass` | `warn` | `error`), a 0..1 mapping confidence, and a checklist
keyed to real facts: profile assertion, mandatory cardinality, primary
terminology binding, subject reference resolution, and BP-component shape. The
catalog aggregates these so the console shows an *earned* conformance rate.

## Search parameters

`src/lib/lakehouse/search-params.ts` declares a US-Core-aligned subset of the
FHIR search-parameter matrix per resource type and a pure extractor that
flattens a resource into indexable `SearchToken`s. This is intentionally compact
(the parameters the console and explorer actually use), not the full 1,000+
`SearchParameter` set.

## REST surface

The engine is exposed read-only at `/api/leafnerd/fhir`, materialized from the
`leafnerd-demo` tenant:

```
GET /api/leafnerd/fhir                         → lakehouse catalog
GET /api/leafnerd/fhir/metadata                → CapabilityStatement
GET /api/leafnerd/fhir/$audit?_count=N         → audit chain tail + verification
GET /api/leafnerd/fhir/{Type}?{params}         → searchset Bundle
GET /api/leafnerd/fhir/{Type}/{id}             → a resource
GET /api/leafnerd/fhir/{Type}/{id}/_history    → history Bundle
GET /api/leafnerd/fhir/Patient/{id}/$everything → compartment Bundle
```

The **Clinical Lakehouse** console (`/ops/platform/fhir-bridge`) renders the
catalog, an interactive query playground over this surface, the audit chain, and
the indexed search-parameter matrix.

## Durability

The current store is in-memory, materialized from the FHIR mappers on demand —
which matches the `fhir-persistence` contract and keeps the engine portable. To
make Gold durable, supply a concrete store (Prisma- or Iceberg-backed) behind
the same interface; the query, versioning, conformance, and audit logic are
storage-agnostic.
