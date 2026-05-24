# Lakehouse zones — Iceberg specs

LeafBridge separates raw, parsed, canonical, mart, vector, and audit data
into six logical zones, all materialized as Apache Iceberg tables on
S3-compatible object storage (MinIO in dev, S3 / GCS / Azure Blob in cloud).

| Zone | Stack | Partition | Sort order |
| -- | -- | -- | -- |
| Bronze | Iceberg + raw blobs in MinIO | `tenant_id, ingested_year, ingested_month` | `ingested_at` |
| Silver | Iceberg Parquet | `tenant_id, source_id, ingested_year` | `ingested_at` |
| Gold | Iceberg Parquet | `tenant_id, resource_type, year(last_updated)` | `last_updated` |
| Platinum | Iceberg Parquet | `tenant_id, mart_name, period_start` | `period_start` |
| Vector | Qdrant + Postgres metadata | per-tenant Qdrant collection | n/a |
| Audit | Iceberg Parquet | `tenant_id, year(recorded_at), month(recorded_at)` | `recorded_at` |

Each zone has an Iceberg catalog name:

- `leafbridge_bronze`
- `leafbridge_silver`
- `leafbridge_gold`
- `leafbridge_platinum`
- `leafbridge_audit`

(Vector is not Iceberg — it's Qdrant + a metadata projection in Postgres.)

## Zone-by-zone

### Bronze — raw

Stores the source artifact exactly as received. Immutable. The Iceberg
table holds a pointer + metadata:

```sql
CREATE TABLE leafbridge_bronze.ingest (
  tenant_id     STRING NOT NULL,
  source_id     STRING NOT NULL,
  artifact_url  STRING NOT NULL,     -- s3://leafbridge-bronze/{tenant}/{source}/{sha256}.{ext}
  artifact_hash STRING NOT NULL,
  content_type  STRING NOT NULL,
  ingested_at   TIMESTAMP NOT NULL,
  ingested_year INT NOT NULL,
  ingested_month INT NOT NULL
)
PARTITIONED BY (tenant_id, ingested_year, ingested_month)
TBLPROPERTIES ('write.format.default'='parquet');
```

Nothing reads Bronze except the Silver parsers and the regulatory export
pipeline.

### Silver — parsed

Per-source parse shapes. HL7v2 ADT messages here look like HL7v2 trees,
FHIR Bundles look like FHIR Bundles, PDF extracts look like extraction
output. No normalization across sources.

One Iceberg table per source format:

- `leafbridge_silver.hl7v2_adt`
- `leafbridge_silver.fhir_bundle`
- `leafbridge_silver.pdf_extract`
- `leafbridge_silver.csv_observation`

### Gold — canonical FHIR

One Iceberg table per Tier A resource. Each row carries the canonical FHIR
JSON in a `body` column plus the flattened search columns documented in
[data-model.md](./data-model.md).

Gold is the truth. Platinum / Vector / Relational projection all derive
from Gold.

### Platinum — clinical marts

Materialized views computed off Gold. Examples:

| Mart | Purpose | Refresh |
| -- | -- | -- |
| `patient_timeline` | One row per encounter with rolled-up vitals + dx + meds | nightly |
| `pain_cohort_outcomes` | Pain Management research mart | weekly |
| `med_rec_gaps` | Patients with stale med rec | hourly |
| `prior_auth_pipeline` | Pending PAs by status | hourly |

Each mart is owned by a maintainer and has a documented refresh cadence,
input dependencies, and a "delete after" date if it is research-only.

### Vector — AI retrieval

See [data-model.md#ai-retrieval-projection](./data-model.md#ai-retrieval-projection).
Vector is mirrored from Gold; deletion in Gold cascades to Vector within 5
minutes.

### Audit — append-only

Every state-changing operation across every service emits an AuditEvent
that lands here. The Iceberg table is `INSERT ONLY` and Iceberg's snapshot
compaction is configured to never delete prior snapshots in the audit
catalog.

```sql
CREATE TABLE leafbridge_audit.events (
  tenant_id     STRING NOT NULL,
  audit_id      STRING NOT NULL,
  recorded_at   TIMESTAMP NOT NULL,
  type_code     STRING NOT NULL,
  subtype_code  STRING,
  action        STRING NOT NULL,
  outcome       STRING NOT NULL,
  agent_type    STRING NOT NULL,
  agent_id      STRING NOT NULL,
  patient_id    STRING,
  source_resource STRING,
  request_id    STRING,
  prompt_blob   STRING,        -- jsonb stringified; agent prompt + tool calls + outputs
  prev_hash     STRING NOT NULL,
  row_hash      STRING NOT NULL
)
PARTITIONED BY (tenant_id, year(recorded_at), month(recorded_at))
TBLPROPERTIES (
  'history.expire.max-snapshot-age-ms'='-1',
  'write.format.default'='parquet'
);
```
