# ADR-012: Testing pyramid + Playwright as the e2e tier

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
We need to ship quickly without regressing clinical surfaces. A pure
e2e strategy is too slow; a pure unit strategy misses integration
breakage.

## Decision
- Unit (Vitest) for pure functions, validators, parsers, and policy
  evaluators. Fast, run on every commit.
- Integration (Vitest + Prisma against a test database) for queries,
  loaders, and route handlers. Run on every push.
- E2E (Playwright) for golden-path flows and any flow that crosses a
  modality boundary. Run on every PR + nightly.
- Visual snapshots are not part of CI gates — they exist as a tool for
  manual review only.

## Consequences
- Pro: failure modes are isolated by tier.
- Pro: e2e count stays bounded.
- Con: integration tier requires a managed test DB.
- Con: Playwright runtime is the single longest pole in CI.

## Alternatives considered
- Cypress for e2e. Rejected: Playwright's multi-browser story is
  stronger for our patient-app surfaces.
- Storybook + visual regression as a gate. Deferred.
