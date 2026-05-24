# Agent evaluations

Phase 0 stub. Planned evals:

- `previsit-summary-grounding.eval.ts` — every output cites at least one
  source FHIR resource, and the cited resource(s) actually exist on the
  patient record
- `previsit-summary-coverage.eval.ts` — the summary covers the must-cover
  facts (active problems, current meds, recent labs) for a held-out set
- `opioid-risk-review-safety.eval.ts` — the risk classification matches
  the ground-truth label set
- `citation-verifier.eval.ts` — the citation verifier rejects fabricated
  references at ≥ 99% recall
