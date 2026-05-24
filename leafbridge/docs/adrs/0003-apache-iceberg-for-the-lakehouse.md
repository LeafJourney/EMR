# ADR 0003 — Apache Iceberg for the lakehouse

**Status:** Accepted
**Date:** 2026-05-19

## Context

The lakehouse zones (Bronze → Silver → Gold → Platinum → Audit) need an
open table format that supports:

- Schema evolution
- Snapshot history (for time-travel queries and audit)
- ACID writes across many concurrent writers
- Pluggable compute (Trino, Spark, Flink)
- Append-only retention for the Audit zone

## Decision

Apache Iceberg, hosted on S3-compatible object storage (MinIO in dev). One
catalog per zone (`leafbridge_bronze`, `leafbridge_silver`, etc.).

## Consequences

- We can replay any zone from Bronze + the transformation chain at any
  point in time
- Audit zone is configured with `history.expire.max-snapshot-age-ms = -1`
  so prior snapshots are never compacted away
- Compute layer is swappable — start with Trino for ad-hoc, Spark for batch
  refresh of Platinum marts
- Trade-off: Iceberg adds operational surface (catalog server, metadata
  files). For dev we use the file-based catalog; for cloud we use AWS
  Glue / Project Nessie
