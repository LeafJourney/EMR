# Threat model — STRIDE (EMR-774)

STRIDE per service for the MVP architecture. Updated as services ship.

## Top-level threats

| Threat | Mitigation |
| -- | -- |
| PHI exfiltration through misconfigured ACL | Default-deny OPA policies; conformance tests; egress proxy allowlist |
| Cross-tenant data exposure | Row-level security + per-tenant schemas + Kubernetes namespace isolation |
| Audit log tampering | Append-only DB grant + Merkle-chained rows + signed nightly seals |
| Agent jailbreak → unauthorized write-back | Write-back gated by `writeback_policy` at the policy-gateway, not the agent |
| Consent gateway bypass | App-layer code may not call FHIR storage directly — only via the policy-gateway |
| Prompt injection leaks PHI to model provider | Provider-pin + on-prem inference for sensitive classes; "do not train" tag |
| Stolen agent SVID | SVID TTL ≤ 1h + per-agent allowed_tools + per-call audit |
| Supply chain compromise | DCO sign-off + container image signing (cosign) + SBOM on every release |
| Backup restoration of stale PHI | Restore drills test consent recheck on rehydrate |
| Insider misuse | Privileged operations require break-glass with multi-party approval + AuditEvent |

## Per-service STRIDE

### ingestion-gateway

- **S** (Spoofing): a fake source impersonates a hospital. → Source identity
  via SPIFFE SVID issued at source registration; signed manifests on every
  ingest.
- **T** (Tampering): in-flight modification of the bundle. → mTLS, hash
  recorded in Bronze, Provenance ties hash to source.
- **R** (Repudiation): source denies sending. → Per-ingest AuditEvent +
  source's signature on the manifest.
- **I** (Information disclosure): error message leaks PHI. → Logger
  redaction wrapper; error responses reference AuditEvent ID, not PHI.
- **D** (DoS): malformed bundle storms. → Per-source rate limits; DLQ
  capacity caps.
- **E** (Elevation): a low-privilege source ingests into another tenant. →
  Source registry binds source → tenant; mismatch is rejected and audited.

### policy-gateway

- **S**: a service claims to be the agent-orchestrator. → SPIFFE-only mTLS.
- **T**: tampered policy bundle. → Bundle is signed and pinned at startup.
- **R**: decision is denied; subject claims it was allowed. → Every
  decision emits AuditEvent with the policy hash that decided.
- **I**: policy logs leak inputs. → Inputs are stored in AuditEvent but
  not in operational logs; logs reference AuditEvent ID.
- **D**: policy evaluation slows queries. → Decision cache for stable
  inputs (subject + resource type), invalidated on consent change.
- **E**: subject elevates by minting a new claim. → Claims must be signed
  by Keycloak / SPIRE; the gateway re-validates the chain on every call.

### agent-orchestrator

- **S**: a non-agent service claims to be an agent. → SPIFFE SVIDs match
  the agent slug naming pattern; gateway refuses anything else.
- **T**: model output is tampered after generation. → Output is signed
  by the orchestrator before write to the audit ledger.
- **R**: agent denies issuing a specific tool call. → Tool call manifest
  is part of `prompt_blob`; signed.
- **I**: prompt logs leak PHI to ops. → `prompt_blob` lives in audit
  storage only; ops dashboards show counts, not content.
- **D**: agent runaway calls the LLM. → Per-agent rate limits + autonomy
  ceiling.
- **E**: an agent gets tools it should not have. → Tool registry mediates;
  the orchestrator refuses to dispatch a tool not in
  `agent.allowed_tools`.

### rag-service

- **S/T/R/I/D/E** as above, plus:
- **Embedding leakage**: a model provider receives PHI as part of an
  embedding call. → On-prem embedding model for sensitive classes;
  `do_not_train` propagated and enforced by the embedding pipeline.

## Open threats (Phase 0 punch list)

- [ ] How are break-glass clinical reads (emergency access) audited and
  reviewed?
- [ ] Should agent prompts be encrypted-at-rest with a per-tenant key so
  the operations team cannot read them?
- [ ] What is the canary process for a new agent class entering Tier 3+
  autonomy?
- [ ] What is the rollback path when a policy bundle change breaks a
  production query?
