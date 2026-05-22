# LeafBridge packages

Shared libraries published under the `@leafbridge/*` scope.

| Package | What it is |
| -- | -- |
| `fhir-schemas` | TypeScript Zod schemas for Tier A FHIR R4 resources (US Core profiled) |
| `specialty-dsl` | Extension schemas for the Specialty Template manifest — agents, routing rules, write-back policy |
| `agent-sdk` | Agent descriptor types + helpers (`AgentDescriptor`, autonomy tier, output schema, filter-by-modality) |
| `workflow-sdk` | Workflow descriptors, FHIR Subscription wiring, routing-rule evaluator |
| `auth-sdk` | OIDC / SPIFFE client helpers, purpose-of-use propagation, audit-event emitters |
| `ui-kit` | Apple-iOS-feeling React components consumed by `apps/*` |

Versioning: every package is independently semver'd. Breaking changes ship in
a major version. The `@leafbridge/specialty-dsl` package mirrors the shape of
the upstream EMR `SpecialtyManifest` so the same manifest validates on both
sides.
