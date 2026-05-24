# Contributing to LeafBridge

Thanks for your interest in LeafBridge. This guide explains how to set up a
dev environment, the contribution workflow, and the bars we enforce on every
PR.

## Code of Conduct

This project adopts the Contributor Covenant — see [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
By participating you agree to abide by it.

## Developer Certificate of Origin (DCO)

Every commit must be signed off under the [Developer Certificate of Origin](https://developercertificate.org/).
Use `git commit -s` to add a `Signed-off-by:` trailer. CI enforces this on PRs.

## Local development

```bash
# Prerequisites: Node 20+, pnpm 9+, Docker
git clone https://github.com/leafjourney/leafbridge
cd leafbridge
pnpm install
docker compose -f infra/docker-compose/docker-compose.yml up -d
pnpm dev
```

The 30-minute developer promise: a fresh clone should let you ingest a
synthetic patient and watch an AI agent summarize the chart end-to-end. If you
hit a missing step, that is itself a bug — open an issue.

## What lives where

| Directory | Owner | What goes here |
| -- | -- | -- |
| `apps/` | Application teams | User-facing Next.js apps |
| `services/` | Platform team | Backend services (one process each) |
| `packages/` | Platform team | Shared libraries published as `@leafbridge/*` |
| `infra/` | Infra team | Docker, Helm, Terraform, Kubernetes manifests |
| `docs/` | Maintainers | ADRs, architecture, security, IGs |
| `examples/` | Anyone | Synthetic patients, FHIR bundles, demo configs |
| `tests/` | Maintainers | Cross-service tests (conformance, integration, security, agent-evals) |

## Branching + PRs

- `main` is always releasable. All changes land via PR.
- Feature branches: `feature/<short-slug>` or `<owner>/<short-slug>`.
- One logical change per PR. Prefer small PRs.
- Every PR must:
  - Pass CI (`pnpm lint`, `pnpm typecheck`, `pnpm test`, conformance suite)
  - Carry DCO sign-off on every commit
  - Reference the parent Linear issue in the PR title (e.g. `EMR-773 …`)
  - Update docs when behaviour changes
  - Add or update tests when behaviour changes

## Commit style

Conventional Commits-ish:

```
feat(ingestion): accept HL7v2 ADT^A08 messages

Why: outside-EHR transfer demo needs ADT^A08 to update demographics.
How: extend the parser switch + add a unit test for the unmerged
case. Fixes EMR-XYZ.
```

## Architecture invariants (HARD constraints)

Read [docs/architecture/principles.md](docs/architecture/principles.md) before
making structural changes. Highlights:

1. **Never overwrite source truth.** Bronze (raw) is immutable.
2. **No naked prompts.** Every AI output must cite patient-specific source
   data via the RAG service.
3. **Consent-aware retrieval is enforced at the data layer, not the app
   layer.** Policy gateway sits between every retrieval call and the data.
4. **Agent identity is distinct from human identity.** Agents are non-human
   workforce members with their own scoped tokens, allowed tools, allowed
   data classes, and autonomy tier (0–5).
5. **No silent autonomous clinical write-back.** Anything that lands on a
   chart goes through the human review queue.
6. **Tenant isolation by design.** Every table either carries a tenant key
   that is enforced by row-level security or lives in a per-tenant schema.

## Security disclosures

Do **not** open public issues for security bugs. See [SECURITY.md](SECURITY.md)
for the disclosure process.

## License + provenance

By contributing you agree your contribution is licensed under Apache 2.0 (the
license of this repository) and that you have the right to make the
contribution. The DCO sign-off is your assertion of that right.
