# ADR-014: Synthetic patient data strategy

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
LeafBridge needs realistic FHIR data for tests, demos, and reproducible
bug reports. Real patient data is off-limits for these uses. The two
realistic synthetic-data sources are:

- **Hand-authored exemplars:** small, opinionated FHIR Bundles we craft
  to cover specific clinical narratives.
- **Synthea:** an open-source synthetic patient generator that produces
  realistic FHIR populations at scale.

## Decision
Ship both, layered:

1. Two hand-authored exemplar bundles live in
   `examples/synthetic-patients/` and are the canonical fixtures for
   tests and onboarding. They are kept small and readable so a developer
   can fully understand them.
2. Synthea-generated populations are pulled out-of-band via
   `pnpm run load:synthetic --source synthea --n 100`. They are *not*
   committed to git.
3. A loader script (`scripts/load-synthetic.ts`) reads bundles into the
   Postgres test DB. The loader is idempotent and tags every row with
   the bundle id it came from for easy teardown.

## Consequences
- Pro: tests have deterministic, hand-readable fixtures.
- Pro: demos and load tests scale via Synthea.
- Con: two parallel formats — we own the conversion layer.
- Con: Synthea populations drift over Synthea releases; we pin a version.

## Alternatives considered
- Synthea-only. Rejected: opaque, slow tests; hard to debug.
- Hand-authored only. Rejected: can't generate population-scale data.
