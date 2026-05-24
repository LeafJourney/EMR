# ADR 0002 — FHIR R4 + US Core as canonical truth

**Status:** Accepted
**Date:** 2026-05-19

## Context

Healthcare data lives in many shapes (HL7v2, C-CDA, PDFs, custom JSON). For
LeafBridge to interoperate with anything — outside EHRs, payers, registries
— we need one canonical shape internally.

## Decision

FHIR R4 is the canonical internal shape. Every record in the Gold zone is a
FHIR R4 resource. Inbound non-FHIR shapes (HL7v2, C-CDA, CSV) are parsed in
Silver and normalized to FHIR in Gold.

US Core 6.1.0 profiles constrain the Tier A resources. We do not invent
extensions until US Core does not cover the field.

## Consequences

- Every Tier A resource has a documented US Core profile in
  `docs/implementation-guides/fhir-resources/`
- Validation is enforced by HAPI's `$validate` operation, not by app code
- Non-FHIR inbound formats live in Silver only — never persist a non-FHIR
  shape in Gold
- The FHIR Subscriptions API drives Layer 4 (AI orchestration)
- Trade-off: FHIR R4 is verbose; the relational projection trades that
  off by flattening for OLTP queries
