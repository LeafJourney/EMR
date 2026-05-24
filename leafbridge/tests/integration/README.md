# Integration tests

End-to-end demo flows. Phase 0 stub.

Planned tests:

- `ingest-fhir-bundle.spec.ts` — POST `examples/synthetic-patients/patient-001.json`,
  assert downstream Provenance + AuditEvent rows exist
- `mpi-resolve-duplicate.spec.ts` — POST the same patient with a different
  MRN; assert the MPI golden record links both sources with an audited
  decision
- `consent-gates-retrieval.spec.ts` — disable `Observation` in Consent;
  assert the agent's read is denied + audited
- `previsit-summary.spec.ts` — run the `previsit_summary` agent end-to-end
  and assert the output cites at least one source FHIR resource
