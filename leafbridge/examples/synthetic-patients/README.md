# Synthetic patients

Synthetic FHIR Bundles used by the 30-minute developer quickstart. Each
bundle is a FHIR `transaction` so it can be POSTed wholesale to the FHIR
server.

| File | Notes |
| -- | -- |
| `patient-001.json` | Riya Singh, 49F, low back pain, pain score 9/10. Hits the high_pain_score routing rule. |

## Loading

```bash
pnpm tsx ../../scripts/load-synthetic-patient.ts patient-001.json
```
