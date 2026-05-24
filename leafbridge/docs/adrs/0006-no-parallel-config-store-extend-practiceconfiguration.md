# ADR 0006 — No parallel config store; extend PracticeConfiguration

**Status:** Accepted
**Date:** 2026-05-19

## Context

LeafBridge needs per-practice configuration for:

- Which agents are enabled
- Clinical routing rules (FHIR Subscription triggers → queue)
- Write-back policy (allowed resources, approval requirement, max autonomy)

The upstream EMR already runs a Practice Onboarding Controller
([EMR-407](https://linear.app/emr-project/issue/EMR-407)) with a
`PracticeConfiguration` object holding `selected_specialty`, `care_model`,
`enabled_modalities[]`, etc. A separate LeafBridge DSL would duplicate that
store and inevitably drift.

## Decision

LeafBridge **does not** introduce a new per-practice config store. Instead
we extend the existing schemas:

- **Specialty Template manifest** ([EMR-408](https://linear.app/emr-project/issue/EMR-408))
  gets three new optional sections: `agents[]`, `clinical_routing_rules[]`,
  `writeback_policy`.
- **Practice Configuration Object** ([EMR-409](https://linear.app/emr-project/issue/EMR-409))
  gets three new optional fields: `agent_enable_overrides`,
  `clinical_routing_rules`, `writeback_policy` (per-practice overrides).

LeafBridge services read `PracticeConfiguration` via the typed
`getPracticeConfig(practiceId)` client. The Consent & Policy Gateway reads
`writeback_policy` from that single source.

## Consequences

- No duplicate stores, no drift
- Cannabis-bleed gate from EMR-414 applies to agents identically:
  `isModalityEnabled(practiceId, agent.modality)` filters agents the same
  way it filters UI modules
- Schema migration is purely additive (default-null on existing rows)
- LeafBridge open-source ships the typed shapes for the new sections as
  `@leafbridge/specialty-dsl`; the EMR commercial layer hosts the registry
  instance and the data
- Trade-off: LeafBridge has a coupling to the EMR schema. We mitigate by
  carrying the shapes in `@leafbridge/specialty-dsl` (which is the source
  of truth for both repos via JSON Schema + Zod)
