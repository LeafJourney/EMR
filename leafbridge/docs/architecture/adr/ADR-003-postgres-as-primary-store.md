# ADR-003: PostgreSQL as the single primary datastore

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
We need transactional integrity for clinical writes, JSON for open-shape
agent payloads, and a query surface flexible enough for analytics. Adding
a second store now would multiply operational complexity without yet
having a workload that exceeds Postgres.

## Decision
PostgreSQL (Supabase-hosted) is the single primary datastore. Schema
changes flow through Prisma migrations. JSON columns are used only when
the shape is genuinely open; otherwise columns are typed.

## Consequences
- Pro: one store, one backup story, one set of access patterns.
- Pro: pgcrypto + RLS available when we need them.
- Con: heavy analytical workloads will eventually need an OLAP sibling.
- Con: full-text search on note bodies will need pg_trgm tuning.

## Alternatives considered
- DynamoDB / document store. Rejected: clinical data is relational.
- Snowflake/BigQuery from day one. Rejected: premature; cost > value.
