# LeafBridge Architecture Decision Records (ADRs)

Every load-bearing architectural decision for LeafBridge lives here as a
short markdown file using the template below. ADRs are append-only — once
accepted, they are amended only by writing a new ADR that supersedes them.

## Template

```
# ADR-NNN: <short title>

- **Status:** Proposed | Accepted | Superseded by ADR-XYZ
- **Date:** YYYY-MM-DD
- **Owners:** <github handles>

## Context
What problem are we deciding about? What constraints apply? What does the
status quo look like and why is it not enough?

## Decision
The chosen approach, in one or two paragraphs. State it crisply enough that
a reader can tell whether a future PR conforms.

## Consequences
What follows from this decision — both good (capabilities we unlock) and
bad (complexity we now own). Call out the things that get harder later.

## Alternatives considered
At least one credible alternative and why we did not pick it. Add a
one-line note when the trade-off is non-obvious.
```

## Index

| ID | Title | Status |
| --- | --- | --- |
| [ADR-001](ADR-001-fhir-as-canonical-data-model.md) | FHIR R4 as the canonical clinical data model | Proposed |
| [ADR-002](ADR-002-monolith-vs-microservices.md) | Monolithic Next.js deployment, modular internals | Proposed |
| [ADR-003](ADR-003-postgres-as-primary-store.md) | PostgreSQL as the single primary datastore | Proposed |
| [ADR-004](ADR-004-prisma-as-orm.md) | Prisma as the canonical ORM | Proposed |
| [ADR-005](ADR-005-agent-framework.md) | LeafBridge agent framework + orchestrator boundary | Proposed |
| [ADR-006](ADR-006-terminology-service.md) | Terminology service as a versioned read-through cache | Proposed |
| [ADR-007](ADR-007-policy-engine.md) | Policy decisions are first-class, logged, and explainable | Proposed |
| [ADR-008](ADR-008-event-log-and-audit.md) | Append-only event log + ControllerAuditLog | Proposed |
| [ADR-009](ADR-009-tenant-isolation.md) | Tenant isolation via `organizationId` scoping | Proposed |
| [ADR-010](ADR-010-secrets-and-keys.md) | Secrets, encryption keys, and field-level encryption | Proposed |
| [ADR-011](ADR-011-deployment-and-runtime.md) | Deployment topology, runtimes, edge boundary | Proposed |
| [ADR-012](ADR-012-testing-and-qa.md) | Testing pyramid + Playwright as the e2e tier | Proposed |
| [ADR-013](ADR-013-open-source-license.md) | LeafBridge open-source license (Apache-2.0) | Accepted |
| [ADR-014](ADR-014-synthetic-data-strategy.md) | Synthetic patient data strategy (hand-authored + Synthea) | Proposed |
