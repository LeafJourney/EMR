# terminology-service

**Module 4.** LOINC, SNOMED CT, RxNorm, ICD-10, CPT, UCUM, NPI lookups.
Local-to-canonical code mappings with confidence scoring and a human-review
queue for low-confidence mappings.

## Endpoints

- `GET /lookup?system=...&code=...` — display, status, parents
- `POST /translate` — local code → canonical code with confidence
- `POST /validate` — value-set membership
- `GET /review-queue` — low-confidence mappings awaiting human review

## Notes

- Code systems are loaded as snapshots on a versioned cadence
- Managed-terminology is a commercial offering; the open-source service ships
  with FHIR-distributed value sets plus a manual mappings table
