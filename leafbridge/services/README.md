# LeafBridge services

Backend services. One process per directory. Each service owns its data and
exposes contracts via the FHIR API, OpenAPI, or both.

| Service | Module | Purpose | Phase |
| -- | -- | -- | -- |
| `ingestion-gateway` | 1 | REST + FHIR Bundle ingestion, HL7v2 ADT, CSV/PDF, DLQ, provenance | 1 |
| `fhir-server-adapter` | 2 | Canonical FHIR JSON, US Core validation, versioning, basic search, audit | 1 |
| `terminology-service` | 4 | LOINC/SNOMED/RxNorm/ICD-10/UCUM lookup, local mappings, confidence | 2 |
| `mpi-service` | 3 | Identity matching, source mapping, manual review, merge/split audit | 2 |
| `consent-service` | 5 | FHIR Consent resource CRUD, purpose-of-use, sensitive-data segmentation | 3 |
| `policy-gateway` | 5 | OPA policy decision point, min-necessary filter, AuditEvent emit | 3 |
| `agent-orchestrator` | 6 | Agent + tool registries, identity, approval queue, RAG, citation enforcement | 4 |
| `rag-service` | 7 | Patient-context retrieval, FHIR + document chunking, vector index | 4 |
| `audit-service` | — | Append-only AuditEvent persistence, query by user/agent/patient/time | 1 |
| `notification-router` | — | Routes work into queues (clinical triage, eligibility review, etc.) | 4 |

## Service contract

Every service:

- Exposes `/health` (liveness) and `/ready` (readiness)
- Emits Prometheus metrics on `/metrics`
- Emits OpenTelemetry traces to the collector at `otel:4317`
- Authenticates callers via OIDC (humans) or SPIFFE (agents)
- Writes AuditEvent to the audit-service for every state-changing call
- Carries an `X-Tenant-Id` header end-to-end (validated against caller's claims)
- Honors `X-Purpose-Of-Use` semantics per HL7 PurposeOfUse codes
- Refuses to start without TLS material when `LEAFBRIDGE_ENV != dev`
