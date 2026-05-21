# ADR-002: Monolithic Next.js deployment, modular internals

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
At our current scale (single-digit practices, one engineering team), a
microservice topology multiplies operational cost without buying us
deployment-velocity or isolation that matters. We do, however, need
clean internal seams so we can extract services later when scale demands.

## Decision
Ship as a single Next.js application with server actions + route handlers.
Internal modules under `src/lib/**` follow a "module-as-port" rule: every
module exports a typed public surface and never reaches across to another
module's internals. Workers (`src/workers/**`) and crons run in the same
codebase but separate processes.

## Consequences
- Pro: one deploy, one log stream, one type graph.
- Pro: refactors are atomic across boundaries.
- Con: a single bad migration can take down everything.
- Con: scaling vertical until we cross the threshold to extract.

## Alternatives considered
- Microservices per domain (charting, billing, RCM, agents). Rejected:
  operational overhead unaffordable at current team size.
- Modular monorepo with separate deploys. Deferred: pick this up when we
  pass ~10 engineering FTEs.
