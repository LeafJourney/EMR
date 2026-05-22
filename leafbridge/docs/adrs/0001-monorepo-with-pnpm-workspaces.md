# ADR 0001 — Monorepo with pnpm workspaces

**Status:** Accepted
**Date:** 2026-05-19

## Context

LeafBridge ships several services and a handful of shared packages
(`@leafbridge/specialty-dsl`, `@leafbridge/agent-sdk`,
`@leafbridge/fhir-schemas`, …). We need a tree layout that lets us:

- Share TypeScript types across services and apps
- Run cross-package tests as one CI job
- Iterate on a shared package without publishing to npm between every change

## Decision

Single monorepo with pnpm workspaces. Workspace globs:

```
apps/*
services/*
packages/*
```

Each subproject has its own `package.json` and `tsconfig.json`. The root
`tsconfig.base.json` carries the strict compiler options every project
extends.

## Consequences

- Cross-package refactors land as a single PR
- CI installs once at the root; per-package scripts run via `pnpm -r run`
- We avoid Nx / Turborepo for v0.1 to keep the dependency surface small —
  revisit if the build graph grows past ~15 packages
- Long-term: packages that stabilize get published to npm under `@leafbridge/*`
  for consumption outside the repo
