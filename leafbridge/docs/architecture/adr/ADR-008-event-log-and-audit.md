# ADR-008: Append-only event log + ControllerAuditLog

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
HIPAA, state cannabis regulators, and our own incident response require
a who-did-what trail that cannot be tampered with after the fact.
Existing app logs are not durable enough and aren't structured for
compliance review.

## Decision
Two append-only stores:
1. `AuditLog` — every clinical / PHI-touching action.
2. `ControllerAuditLog` — every super-admin / controller mutation.

Both tables are append-only enforced at the DB grant + trigger level.
Writes go through `logControllerAction()` / `logAudit()` helpers that
retry with exponential backoff and surface failures to Sentry. Nightly
export to immutable storage with a verification ledger (EMR-750).

## Consequences
- Pro: one query answers "who changed X?"
- Pro: compliance / discovery requests are mechanical.
- Con: append-only rules constrain schema evolution.
- Con: PII in audit rows needs the same encryption posture as the source.

## Alternatives considered
- App logs only. Rejected: not durable, not queryable by subject.
- Vendor SIEM (Datadog, etc.). Adopted alongside, not as a replacement.
