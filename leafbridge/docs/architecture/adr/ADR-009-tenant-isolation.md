# ADR-009: Tenant isolation via `organizationId` scoping

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
Multiple practices share one application + one database. A bug that
returns row X to tenant Y is a PHI breach. We need a posture that fails
closed and is easy to review.

## Decision
Every multi-tenant table carries a non-null `organizationId`. Every read
or write must scope by `organizationId` resolved from the authenticated
session, never from a request body. Row-level security (RLS) policies in
Postgres act as a second line of defense for direct connections.
Super-admins acting cross-tenant go through a dedicated "view as" path
that writes an audit row.

## Consequences
- Pro: a missing scope is a runtime error, not a silent bleed.
- Pro: RLS catches code paths we forget about.
- Con: cross-tenant features (e.g. fleet HQ) require explicit opt-in.
- Con: tests must always materialize a tenant.

## Alternatives considered
- Per-tenant schemas. Rejected: migrations multiply by tenant count.
- Per-tenant DBs. Deferred: viable for enterprise tier post-product-market-fit.
