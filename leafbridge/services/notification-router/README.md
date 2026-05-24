# notification-router

Routes agent output (and other clinical events) into queues such as
`clinical_triage_queue`, `refill_review_queue`, and `eligibility_review_queue`.

Reads routing rules from the Specialty Template manifest
(`clinical_routing_rules`) and the practice override on the Practice
Configuration. Triggered by FHIR Subscriptions emitted by the
[agent-orchestrator](../agent-orchestrator/).

## Rule shape

```yaml
clinical_routing_rules:
  - name: high_pain_score
    when:
      resource: Observation
      code: pain_score
      predicate: { value_greater_than: 8 }
    then:
      route_to: clinical_triage_queue
      priority: high
      trigger_agent: opioid_risk_review   # optional
```

Evaluator implementation lives in `../../packages/workflow-sdk/`.
