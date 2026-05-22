# Five-layer architecture

LeafBridge is built as five horizontal layers. Each layer has well-defined
contracts to the layer above and below.

```
┌────────────────────────────────────────────────────────────────┐
│  Layer 5 — Application & Execution                              │
│    Mission Control · Patient 360 · Agent Workbench ·            │
│    Care Coordination Routing · Specialty Workflow Shells        │
└────────────────────────────────────────────────────────────────┘
                            ▲
┌────────────────────────────────────────────────────────────────┐
│  Layer 4 — AI Orchestration Engine                              │
│    Agent Registry · Tool Registry · Context Broker · RAG ·      │
│    Policy Gatekeeper · Execution Engine · Human Review Queue ·  │
│    Evaluation Service · Audit Ledger                            │
└────────────────────────────────────────────────────────────────┘
                            ▲
┌────────────────────────────────────────────────────────────────┐
│  Layer 3 — Trust Layer                                          │
│    Master Patient Index · Consent & Policy · Agent Identity ·   │
│    Keycloak · OPA · Vault · SPIFFE/SPIRE · Kong/Envoy           │
└────────────────────────────────────────────────────────────────┘
                            ▲
┌────────────────────────────────────────────────────────────────┐
│  Layer 2 — Clinical Lakehouse                                   │
│    Bronze · Silver · Gold · Platinum · Vector · Audit           │
│    Iceberg · Trino · Spark/Flink · Postgres · Qdrant · Kafka    │
└────────────────────────────────────────────────────────────────┘
                            ▲
┌────────────────────────────────────────────────────────────────┐
│  Layer 1 — Ingestion & Interoperability                         │
│    FHIR · HL7v2 · C-CDA · PDF · CSV adapters · Terminology      │
│    SNOMED · LOINC · RxNorm · ICD-10 · CPT · UCUM · NPI          │
└────────────────────────────────────────────────────────────────┘
```

## Contracts at each boundary

### Layer 1 → Layer 2

- Bronze artifact written to MinIO with provenance metadata
- Silver Iceberg row written with the parsed shape
- Validation outcome (`accepted`, `quarantined`, `rejected`) emitted as an
  AuditEvent

### Layer 2 → Layer 3

- Gold-zone FHIR resources are retrievable only via the policy-gateway
- MPI golden record lookups use the canonical Patient.id
- AuditEvents from Layer 2 services feed the Trust Layer's audit ledger

### Layer 3 → Layer 4

- Every agent retrieval call carries the agent's SVID + purpose-of-use header
- Policy decisions are returned synchronously; agents must re-call on cache
  expiry
- Consent state is queried per-call, never cached past the request

### Layer 4 → Layer 5

- Agent output flows into the human-review queue
- Approved output writes back via Layer 3 (policy-gateway) → Layer 2 (Gold)
- Mission Control reads from Layer 2 Platinum marts + Layer 4 audit ledger

## Component sizing

Each service runs as its own process. Horizontal scale is per-service.
Stateful components (HAPI, Postgres, Qdrant, Temporal) run as managed
instances in cloud deploys.
