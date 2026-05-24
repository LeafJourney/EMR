# mpi-service

**Module 3.** Master Patient Index. Deterministic + probabilistic +
referential identity matching. Source-to-golden-record mapping. Manual review
queue. Merge / split with full audit.

## Tables

- `mpi_golden_record(id, fingerprint, status, created_at, updated_at)`
- `mpi_source_link(golden_id, source_id, source_patient_id, score, decision, decided_at, decided_by)`
- `mpi_merge_history(prior_golden_id, new_golden_id, reason, decided_by, decided_at)`

## Decision logic

1. Deterministic block (SSN-last-4 + DOB + first-3-of-last)
2. Probabilistic score (Fellegi-Sunter on demographics)
3. Threshold: auto-link ≥ 0.97, auto-reject < 0.6, manual-review otherwise
4. Referential pass via Coverage or Practitioner overlap (Phase 2)

Every link / merge / split emits AuditEvent and is reversible.
