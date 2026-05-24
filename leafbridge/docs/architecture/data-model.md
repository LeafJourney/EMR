# Data model — Phase 0.2 (EMR-772)

LeafBridge stores every patient record three times:

1. **Canonical FHIR JSON** — source-of-truth FHIR R4, US Core profiled
2. **Relational projection** — flattened Postgres tables for OLTP query
3. **AI retrieval projection** — vector index + structured metadata in Qdrant

Plus the lakehouse zones (Bronze → Silver → Gold → Platinum → Vector → Audit)
record every transformation along the way so we can re-derive every value
back to its source artifact.

This document covers:

- [Tier A resources](#tier-a-resources) and their US Core constraints
- [Relational projection DDL](#relational-projection-ddl)
- [AI retrieval projection](#ai-retrieval-projection)
- [Lakehouse zones](#lakehouse-zones)
- [Provenance schema](#provenance-schema)
- [AuditEvent schema](#auditevent-schema)
- [MPI golden record schema](#mpi-golden-record-schema)
- [Tenant isolation strategy](#tenant-isolation-strategy)
- [ER diagram](#er-diagram)

The per-resource US Core profiles live in
[`../implementation-guides/fhir-resources/`](../implementation-guides/fhir-resources/).
Lakehouse zone Iceberg specs live in [`./lakehouse-zones.md`](./lakehouse-zones.md).

---

## Tier A resources

The MVP set. Every Tier A resource has a canonical, relational, and
retrieval projection.

| Domain | Resource | US Core profile |
| -- | -- | -- |
| Identity | Patient | [us-core-patient](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-patient.html) |
| Identity | Practitioner | [us-core-practitioner](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-practitioner.html) |
| Identity | Organization | [us-core-organization](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-organization.html) |
| Encounters | Encounter | [us-core-encounter](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-encounter.html) |
| Clinical facts | Condition | [us-core-condition-encounter-diagnosis](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-condition-encounter-diagnosis.html) |
| Clinical facts | Observation (vitals + labs + social-history + clinical-result) | per-category US Core profiles |
| Medications | MedicationRequest | [us-core-medicationrequest](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-medicationrequest.html) |
| Labs | DiagnosticReport | [us-core-diagnosticreport-lab](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-diagnosticreport-lab.html) |
| Documents | DocumentReference | [us-core-documentreference](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-documentreference.html) |
| Documents | Binary | base FHIR R4 |
| Governance | Consent | base FHIR R4 |
| Governance | Provenance | base FHIR R4 |
| Governance | AuditEvent | base FHIR R4 + LeafBridge extensions |

---

## Relational projection DDL

Every Tier A resource gets a flat Postgres table. Canonical JSON lives in
the `body jsonb` column so the projection is a *cache* — the canonical
record is the source of truth.

Common columns (every table):

```sql
id              uuid primary key,
tenant_id       uuid not null references tenant(id),
resource_id     text not null,                  -- the FHIR `id`
version_id      int  not null,                  -- monotonic per resource_id
last_updated    timestamptz not null default now(),
deleted_at      timestamptz,                    -- soft-delete only
profile_url     text[],                         -- US Core profile claims
body            jsonb not null,                 -- canonical FHIR JSON
provenance_id   uuid not null references provenance(id),
unique (tenant_id, resource_id, version_id)
```

Each resource gets a few extra columns to support search:

```sql
-- patient
create table patient (
  ...common...,
  mrn              text,         -- denormalized from Patient.identifier
  given_name       text,
  family_name      text,
  birth_date       date,
  gender           text,
  golden_id        uuid references mpi_golden_record(id)
);
create index on patient (tenant_id, family_name, given_name);
create index on patient (tenant_id, birth_date);
create index on patient (tenant_id, mrn);

-- encounter
create table encounter (
  ...common...,
  patient_id    uuid not null references patient(id),
  status        text not null,
  class_code    text,
  type_code     text,
  service_provider_id uuid references organization(id),
  period_start  timestamptz,
  period_end    timestamptz
);
create index on encounter (tenant_id, patient_id, period_start desc);

-- condition
create table condition (
  ...common...,
  patient_id    uuid not null references patient(id),
  encounter_id  uuid references encounter(id),
  clinical_status text,           -- active | recurrence | inactive | ...
  verification_status text,       -- confirmed | provisional | ...
  category_codes text[],
  code_system  text,
  code         text,
  onset_datetime timestamptz
);
create index on condition (tenant_id, patient_id, code_system, code);

-- observation
create table observation (
  ...common...,
  patient_id    uuid not null references patient(id),
  encounter_id  uuid references encounter(id),
  status        text not null,
  category_codes text[],
  code_system  text,
  code         text,
  value_quantity numeric,
  value_unit    text,
  value_string  text,
  effective_at  timestamptz
);
create index on observation (tenant_id, patient_id, code_system, code, effective_at desc);
create index on observation (tenant_id, patient_id, effective_at desc);

-- medicationrequest
create table medicationrequest (
  ...common...,
  patient_id    uuid not null references patient(id),
  encounter_id  uuid references encounter(id),
  status        text not null,
  intent        text not null,
  medication_system text,
  medication_code   text,
  medication_text   text,
  authored_at   timestamptz
);
create index on medicationrequest (tenant_id, patient_id, status, authored_at desc);

-- diagnosticreport
create table diagnosticreport (
  ...common...,
  patient_id    uuid not null references patient(id),
  encounter_id  uuid references encounter(id),
  status        text not null,
  category_codes text[],
  code_system  text,
  code         text,
  effective_at  timestamptz,
  issued_at     timestamptz
);

-- documentreference
create table documentreference (
  ...common...,
  patient_id    uuid not null references patient(id),
  encounter_id  uuid references encounter(id),
  status        text not null,
  type_code     text,
  category_codes text[],
  date          timestamptz,
  -- binary blob stored in MinIO; this is the pointer
  attachment_url text not null,
  attachment_hash text not null,
  sensitive     boolean not null default false
);
create index on documentreference (tenant_id, patient_id, type_code, date desc);

-- consent
create table consent (
  ...common...,
  patient_id    uuid not null references patient(id),
  status        text not null,
  scope_codes   text[],
  category_codes text[],
  policy_rule_code text,
  provision_type text,            -- permit | deny
  purpose_codes text[],
  data_class_codes text[],
  effective_period_start timestamptz,
  effective_period_end   timestamptz
);
create index on consent (tenant_id, patient_id, status, effective_period_end);

-- provenance — referenced from every other resource
create table provenance (
  id            uuid primary key,
  tenant_id     uuid not null references tenant(id),
  target_reference text not null,           -- ResourceType/id/_history/version
  recorded_at   timestamptz not null,
  agent_type    text not null,              -- human | agent | system
  agent_id      text not null,              -- user id, agent id, or service name
  source_artifact_url text,                 -- MinIO Bronze pointer
  source_artifact_hash text,
  transformation_chain text[]               -- ordered list of transformer ids
);
create index on provenance (tenant_id, target_reference);

-- auditevent — append-only
create table auditevent (
  id            uuid primary key,
  tenant_id     uuid not null references tenant(id),
  type_code     text not null,
  subtype_code  text,
  action        char(1) not null,           -- C | R | U | D | E
  recorded_at   timestamptz not null,
  outcome       text not null,              -- 0=success, 4=minor, 8=serious, 12=major
  agent_type    text not null,              -- human | agent | system
  agent_id      text not null,
  patient_id    uuid,
  source_resource text,                     -- ResourceType/id touched
  request_id    text,                       -- end-to-end correlation
  prompt_blob   jsonb,                      -- agent: prompt + tool calls + outputs
  prev_hash     bytea not null,             -- Merkle chain anchor
  row_hash      bytea not null
);
create index on auditevent (tenant_id, patient_id, recorded_at desc);
create index on auditevent (tenant_id, agent_id, recorded_at desc);
create index on auditevent (tenant_id, recorded_at desc);
```

The `auditevent` table is **append-only** at the database layer:

```sql
revoke update, delete on auditevent from leafbridge_app;
```

A nightly job seals batches by hashing all rows since the last seal, signing
the hash with the audit-service's KMS key, and writing the signed root to
`auditevent_seal(tenant_id, batch_start, batch_end, signed_root)`.

---

## AI retrieval projection

Lives in Qdrant (vectors) + Postgres (structured metadata). One collection
per tenant, namespaced by sensitivity class.

| Collection | Stores | Filter dims |
| -- | -- | -- |
| `fhir-resources-{tenant}` | one point per Tier A resource | resource_type, patient_id, date, data_class |
| `documents-{tenant}` | one point per document chunk | patient_id, document_id, chunk_offset, sensitivity |
| `notes-sensitive-{tenant}` | sensitive-segmented notes (42 CFR Part 2, BH, reproductive) | patient_id, sensitivity, consent_required |

Embeddings:

- Default model: `mxbai-embed-large` (dim 1024) — swappable via config
- Embedding records the model id + version on each point so re-embedding is
  reproducible

Retrieval filter (applied **before** the ANN search):

```ts
{
  patient_id: $patient,
  data_class: { in: $allowed_data_classes },
  sensitivity: { in: $consented_categories },
  date: { gte: $time_window_start, lte: $time_window_end }
}
```

---

## Lakehouse zones

Apache Iceberg on S3-compatible (MinIO in dev). One Iceberg catalog per
zone.

| Zone | Format | Retention | Purpose |
| -- | -- | -- | -- |
| Bronze | Raw bytes in MinIO + Iceberg pointer table | Tenant policy (default 7y) | Source artifact, immutable |
| Silver | Parquet, parsed but not normalized | 7y | Per-source parsed shape |
| Gold | Parquet, canonical FHIR R4 | 7y | The truth |
| Platinum | Parquet, clinical marts (e.g. patient_timeline) | 1y rolling | OLAP / research |
| Vector | Qdrant + Postgres metadata | Mirrors Gold | AI retrieval |
| Audit | Iceberg, append-only | 7y minimum | AuditEvent + Provenance |

Iceberg specs (table layouts, partitioning, sort orders) live in
[`./lakehouse-zones.md`](./lakehouse-zones.md).

---

## Provenance schema

Every transformation is recorded. Provenance lets you answer:

> Where did this Observation value come from, and what was the source artifact?

The schema is the FHIR `Provenance` resource plus the relational projection
above. Each Gold-zone resource carries `provenance_id` pointing to its row.

The `transformation_chain` is an ordered list of registered transformer ids,
each one capturing input → output:

```text
[hl7v2.adt.parser@1.0.0, hl7v2.adt.normalizer@1.2.0, us-core.patient.validator@6.1.0]
```

Transformer ids are pinned at registration time. Replaying a transformation
must produce a byte-identical output from a byte-identical input — drift is
a bug.

---

## AuditEvent schema

Fields (see DDL above). Highlights:

- **Append-only at the database layer.** `revoke update, delete`.
- **Merkle-chained.** Every row carries `prev_hash`; nightly batches are
  hashed + signed.
- **Per-tenant.** No cross-tenant auditing — auditors get a scoped view.
- **Agent-aware.** When `agent_type = 'agent'` the `prompt_blob` captures
  the full prompt, tool calls, source data, and output for that
  decision.
- **Queryable by user / agent / patient / time window** in O(log n) via the
  three composite indexes.

Retention: 7 years default. Tenant configurable up only, never down.

---

## MPI golden record schema

```sql
create table mpi_golden_record (
  id            uuid primary key,
  tenant_id     uuid not null references tenant(id),
  fingerprint   text not null,             -- deterministic block key
  status        text not null,             -- active | merged_into | superseded
  merged_into   uuid references mpi_golden_record(id),
  created_at    timestamptz not null,
  updated_at    timestamptz not null
);

create table mpi_source_link (
  golden_id     uuid not null references mpi_golden_record(id),
  source_id     uuid not null references source(id),
  source_patient_id text not null,
  score         numeric not null,
  decision      text not null,             -- auto-link | manual-link | rejected
  decided_by    uuid,                      -- user id when manual
  decided_at    timestamptz not null,
  unique (source_id, source_patient_id)
);

create table mpi_merge_history (
  id            uuid primary key,
  tenant_id     uuid not null references tenant(id),
  prior_golden_id uuid not null references mpi_golden_record(id),
  new_golden_id   uuid not null references mpi_golden_record(id),
  reason        text not null,
  decided_by    uuid not null,
  decided_at    timestamptz not null
);
```

Every link / merge / split:

- Emits AuditEvent
- Is reversible (split rewrites `merged_into = null` and recreates the
  source links the way they were)
- Sees the prior decision in the manual-review queue alongside the new one

---

## Tenant isolation strategy

Three layers of defense:

1. **Database column** — every table carries `tenant_id`. Row-level security
   policies on every table enforce `tenant_id = current_setting('app.tenant_id')`.
2. **Schema** — `audit` and `mpi` live in per-tenant schemas
   (`audit_{tenant}`, `mpi_{tenant}`) so a SQL injection in app code cannot
   read across tenants even if the RLS predicate fails.
3. **Namespace** — at the Kubernetes layer, the Vector index and document
   store live in per-tenant namespaces with NetworkPolicies that forbid
   cross-namespace traffic.

App-layer-only isolation is forbidden. Every new table must pick at least
one of the three.

---

## ER diagram

```text
tenant ──┬──< patient ──┬──< encounter ──┬──< condition
         │              │                 ├──< observation
         │              │                 ├──< medicationrequest
         │              │                 ├──< diagnosticreport
         │              │                 └──< documentreference
         │              ├──< consent
         │              └──< mpi_golden_record ──< mpi_source_link
         │
         ├──< practitioner
         ├──< organization
         ├──< source
         │
         ├──< provenance (referenced from every Gold row)
         └──< auditevent (append-only)
```

A renderable Mermaid version lives at
[`./data-model.mermaid`](./data-model.mermaid).
