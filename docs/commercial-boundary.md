# Commercial vs. Open-Source Boundary

This document is the source of truth for which parts of this repository are
released under the Apache License 2.0 (`LICENSE`) versus retained as
proprietary, commercial code owned by LeafJourney, Inc.

The boundary is drawn at the **LeafBridge substrate** vs. the **LeafJourney
clinical / commercial surfaces** built on top of it.

## Open-source (Apache-2.0)

| Path | What it contains |
| --- | --- |
| `leafbridge/**` | LeafBridge core: FHIR, terminology, agent framework, orchestrator, knowledge/policy stores, workbench scaffolds. |
| `examples/synthetic-patients/**` | Hand-authored synthetic FHIR exemplars used for tests and demos. |
| `docs/architecture/adr/**` | Architecture Decision Records governing LeafBridge. |
| `scripts/load-synthetic.ts` | Loader for synthetic datasets. |

## Proprietary (LeafJourney, Inc., all rights reserved)

| Path | Why it's commercial |
| --- | --- |
| `src/app/(clinician)/**` | LeafJourney clinical UX, charting, sign-off flows. |
| `src/app/(patient)/**` | LeafJourney patient portal UX. |
| `src/app/(operator)/**`, `src/app/(super-admin)/**` | LeafJourney operator / admin surfaces. |
| `src/app/marketplace/**`, `src/app/leafmart/**`, `src/app/store/**` | Cannabis marketplace + storefront. |
| `src/lib/billing/**`, `src/lib/payments/**` | LeafJourney RCM + payments. |
| `src/lib/dispensary/**`, `src/lib/pharmacy/**` | Dispensary + pharmacy integrations. |
| `src/lib/canopy/**`, `src/lib/lifestyle/**`, `src/lib/gamification/**` | LeafJourney product-specific subsystems. |
| `prisma/schema.prisma` (LeafJourney models) | The portions of the schema that model commercial surfaces. The FHIR-shaped models that ship with LeafBridge are open. |

## Rule of thumb

- If it is **substrate** (FHIR data model, agent framework, terminology
  lookup, policy decision logging) → Apache-2.0 / `leafbridge/`.
- If it is a **branded LeafJourney workflow** (cannabis-specific clinical
  surface, marketplace, dispensary, RCM, patient gamification) →
  proprietary.

When in doubt, default to **proprietary** and open the question to
@scwayman1 before publishing.

## Trademark

The names "LeafJourney", "LeafBridge", and the LeafJourney logo are
trademarks of LeafJourney, Inc. The Apache-2.0 grant does not include
permission to use these marks beyond the descriptive use permitted by
LICENSE §6.

See [`docs/architecture/adr/ADR-013-open-source-license.md`](architecture/adr/ADR-013-open-source-license.md)
for the decision history.
