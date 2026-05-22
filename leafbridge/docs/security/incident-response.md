# Incident response runbook (skeleton)

This is a skeleton for the IR runbook. Each section gets filled out as we
exercise tabletop scenarios.

## Severities

| Severity | Trigger | Response time |
| -- | -- | -- |
| **SEV1** | Confirmed PHI exfiltration, cross-tenant exposure, audit tampering | ≤ 15 min |
| **SEV2** | Suspected exposure; service-wide outage; consent gateway bypass | ≤ 1 hr |
| **SEV3** | Single-tenant degradation; failed restore drill | ≤ 4 hr |
| **SEV4** | Internal anomaly; planned-but-late mitigations | next business day |

## Roles

- **Incident commander** — drives the response, owns external comms
- **Operations lead** — runs containment and recovery
- **Communications lead** — talks to customers, regulators, affected
  individuals
- **Scribe** — captures the timeline (used for post-incident review)

## Phases

### 1. Detect

- Alert sources: Sentry, Prometheus alerts on AuditEvent anomalies, OPA
  decision-log alerts, Vault audit log, customer report
- Initial triage: confirm scope (tenants, patients, data classes), pull
  AuditEvent timeline for the affected resources

### 2. Contain

- Revoke the affected SVID(s) / OIDC sessions immediately
- If a policy-gateway bypass is suspected, roll the gateway to the
  last-known-good policy bundle
- If a write-back was malicious, mark the affected resources as
  `provenance.status = 'incident-quarantined'` and remove from active
  rendering

### 3. Eradicate

- Apply the patch and deploy
- Re-issue credentials
- Rotate signing keys if the audit chain was touched

### 4. Recover

- Replay the audit Merkle chain to confirm no other rows were touched
- Re-emit notifications to downstream subscribers if any were missed
- Restore from backup only when the live data is unrecoverable

### 5. Learn

- Post-incident review within 5 business days
- Customer-facing post-mortem within 14 days for SEV1/SEV2
- Update threat model + runbook with the new failure mode

## Notifications

- **Customers**: per the BAA notification schedule
- **HHS OCR**: per HIPAA Breach Notification Rule for confirmed breaches
- **State AGs**: per state breach notification laws

## Tabletop cadence

Every quarter. Scenarios rotate through:

- PHI exfiltration via a stolen agent SVID
- Cross-tenant exposure via a policy-gateway misconfiguration
- Audit chain tampering
- Backup restore failure during a SEV1
- Supply chain compromise of a base container image
