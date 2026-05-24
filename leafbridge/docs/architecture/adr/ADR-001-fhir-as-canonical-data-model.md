# ADR-001: FHIR R4 as the canonical clinical data model

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
LeafBridge needs a clinical data model that supports interoperability,
external integrations, and structured downstream analytics. Inventing a
bespoke model would force every integration partner to learn it; freezing
to a single EMR vendor's shape would bind us to that vendor's velocity.

## Decision
FHIR R4 is the canonical clinical data model. All clinical concepts that
have an FHIR resource (Patient, Encounter, Observation, MedicationRequest,
Condition, AllergyIntolerance, DocumentReference, etc.) are persisted in a
shape that round-trips through `application/fhir+json` without lossy
transformation. LeafJourney-proprietary extensions live under the
`http://leafjourney.com/fhir/StructureDefinition/*` namespace.

## Consequences
- Pro: external partners can integrate via standard FHIR clients.
- Pro: synthetic test data can be generated via Synthea ([[ADR-014]]).
- Con: some workflow data is shoehorned into Extensions, which is uglier
  than a native column.
- Con: schema migrations are constrained by FHIR's narrative invariants.

## Alternatives considered
- A bespoke relational model. Rejected: every integration is a one-off.
- USCDI-only subset. Rejected: too narrow for cannabis-specific outcomes.
