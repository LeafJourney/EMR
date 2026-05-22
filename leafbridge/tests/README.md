# Tests

Cross-service tests. Per-package tests live alongside their `src/` in
`packages/*/src/__tests__/` or `*.test.ts`.

| Directory | Purpose |
| -- | -- |
| `conformance/` | FHIR profile conformance — every Tier A example resource must validate against its US Core profile |
| `integration/` | End-to-end demo flows (ingest → MPI → policy → retrieval → agent → approval → write-back) |
| `security/` | Tenant isolation smoke tests, OPA decision regression, audit-chain replay |
| `agent-evals/` | Agent output quality + safety evaluations |

Tests in this directory run in CI on every PR via the `pnpm test` and
`pnpm conformance` scripts.
