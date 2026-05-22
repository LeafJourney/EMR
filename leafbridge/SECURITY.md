# Security policy

## Reporting a vulnerability

LeafBridge handles clinical data. Security bugs are treated as a first-class
priority. Please **do not** open a public GitHub issue for a suspected
vulnerability.

Report to: `security@leafjourney.com` (GPG key fingerprint published in
`docs/security/pgp.asc` once the project goes public).

We commit to:

- Acknowledge within 2 business days
- Provide an initial assessment within 5 business days
- Coordinate a disclosure timeline with the reporter (default: 90 days from
  acknowledgement, shorter for actively exploited issues)
- Publish a CVE and a public advisory once a fix is shipped, crediting the
  reporter unless they ask to remain anonymous

## Supported versions

LeafBridge is pre-1.0. We patch security issues in the current `main` branch
only. Once we cut v1.0 we will support N and N-1.

## What counts as a security issue

- PHI exfiltration paths (any data class)
- Cross-tenant data exposure
- Authentication or authorization bypass
- Consent or policy gateway bypass — including agent-initiated bypass
- Audit log tampering or evasion
- Secret leakage (logs, error messages, telemetry, AI prompts/responses)
- Supply chain compromise (build, package, container image)
- Crypto downgrade or key handling flaws
- Prompt injection that leads to data exfiltration or unauthorized write-back

## What does NOT count

- Findings that require a privileged attacker who already has the access they
  are trying to abuse
- DoS via the public API at rates we accept by design (rate limits documented
  in `docs/api/rate-limits.md`)
- Self-XSS without persistence

## Hardening posture

See [docs/security/security-model.md](docs/security/security-model.md) for the
full threat model. Quick reference:

| Control | Requirement |
| -- | -- |
| Encryption in transit | TLS 1.2+ |
| Encryption at rest | AES-256 |
| Secrets | Vault / cloud KMS, rotated |
| Identity (humans) | OIDC/SAML via Keycloak |
| Identity (agents) | Scoped service tokens via SPIFFE/SPIRE |
| MFA | Required for admin users |
| Audit logs | Immutable / append-only |
| Agent logs | Prompt + tool calls + source data + output |
| PHI minimization | Policy-enforced at retrieval |
| Tenant isolation | DB / schema / namespace |
| Backups | Encrypted, tested restores |
| DLP | Redaction + egress monitoring |

## Coordinated disclosure hall of fame

(Empty — be the first.)
