# ADR-004: Prisma as the canonical ORM

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
We need typed database access that survives refactors. The choice is
between Prisma, Drizzle, Kysely, and hand-written SQL with codegen.

## Decision
Prisma is the canonical ORM. All schema changes land in
`prisma/schema.prisma` and migrations under `prisma/migrations/`. Raw SQL
is acceptable for performance-critical reads via `prisma.$queryRaw`, but
the type contract still flows through Prisma-generated types.

## Consequences
- Pro: schema is the type system — refactors are caught at compile time.
- Pro: shadow-DB-based migration safety on Supabase.
- Con: deep aggregation queries fight the query builder; we drop to raw.
- Con: Prisma's relational filters can hide N+1 — see [[ADR-012]] perf rules.

## Alternatives considered
- Drizzle. Rejected: lighter, but less mature migration story for our
  multi-tenant RLS posture.
- Hand-rolled SQL + zod. Rejected: too much boilerplate at our schema size.
