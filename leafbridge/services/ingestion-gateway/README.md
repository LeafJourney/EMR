# ingestion-gateway

**Module 1.** REST + FHIR Bundle ingestion endpoint. HL7v2 ADT parser. CSV /
PDF / DocumentReference uploads. Source registry, validation, DLQ, provenance
emission.

## Inputs

- `POST /ingest/fhir-bundle` (Content-Type: `application/fhir+json`)
- `POST /ingest/hl7v2` (Content-Type: `x-application/hl7-v2+er7`)
- `POST /ingest/document` (multipart with PDF / image)
- `POST /ingest/csv?profile=<profile-id>`

## Outputs

- Bronze artifact written to MinIO at `bronze/<tenant>/<source>/<sha256>.<ext>`
- Silver parse (HL7v2 → JSON, FHIR Bundle → individual resources) at
  `silver/<tenant>/<source>/<sha256>.json`
- Provenance.target → Silver artifact
- AuditEvent `agent=ingestion-gateway, action=C`

## Failure modes

- Schema validation fails → quarantine bin, DLQ event, AuditEvent `outcome=4`
- Source unknown → reject 400, source registry must register the source first
- Tenant not whitelisted for source → reject 403, AuditEvent `outcome=8`

## Status

Phase 1 deliverable. Placeholder for now.
