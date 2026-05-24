# Architecture

| Doc | What's in it |
| -- | -- |
| [principles.md](./principles.md) | Hard architectural invariants (no naked prompts, consent-aware retrieval, agent identity, etc.) |
| [data-model.md](./data-model.md) | Tier A FHIR resources, relational projection DDL, AI retrieval projection, provenance, AuditEvent, MPI, tenant isolation, ER diagram |
| [lakehouse-zones.md](./lakehouse-zones.md) | Bronze → Silver → Gold → Platinum → Vector → Audit Iceberg specs |
| [five-layer-architecture.md](./five-layer-architecture.md) | The five layers — ingestion, lakehouse, trust, AI orchestration, application |
| [../adrs/](../adrs/) | Architecture Decision Records |
