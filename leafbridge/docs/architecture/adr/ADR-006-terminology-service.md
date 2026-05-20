# ADR-006: Terminology service as a versioned read-through cache

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
Clinical surfaces depend on LOINC, SNOMED, RxNorm, and ICD-10. We need
fast lookups that return `{display, system, version}` triples, but
re-fetching from upstream registries on every chart open is unaffordable
and offline-hostile.

## Decision
Stand up an internal terminology service with REST lookup endpoints
(`GET /api/terminology/{system}/{code}`) backed by versioned local
tables (`TerminologyConcept`, `TerminologyConceptMap`). Upstream pulls
are scheduled, idempotent, and tagged with the registry version they
came from. Lookups are read-through with a 24h cache.

## Consequences
- Pro: deterministic clinical labels at request time.
- Pro: ConceptMaps survive registry updates without breaking history.
- Con: we own the freshness contract for each code system.
- Con: licensing for SNOMED/UMLS must be tracked.

## Alternatives considered
- Direct upstream API per request. Rejected: latency + rate limits.
- FHIR `$expand` against a hosted terminology server. Deferred: viable
  but adds a vendor dependency.
