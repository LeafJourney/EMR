# Pain Management demo

Walks the Pain Management flow with the high-pain-score routing rule:

1. Load `../synthetic-patients/patient-001.json`
2. The patient's pain score = 9 triggers the `high_pain_score` rule
3. The notification-router routes the encounter to `clinical_triage_queue`
   with `priority: high` and triggers the `opioid_risk_review` agent
4. The `opioid_risk_review` agent generates a risk summary
5. Output lands in the Agent Workbench for the clinician's review

Coming in Phase 4 once the routing rule evaluator is wired end-to-end.
