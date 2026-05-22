# agent-orchestrator

**Module 6.** Agent registry, tool registry, agent identity, RAG queries,
prompt templates, tool-call logging, citation enforcement, safety
evaluations, human-approval queue.

## Agent identity

Every agent is a non-human workforce member with:

- `id` — stable slug (e.g. `previsit_summary`)
- `autonomy_tier` — 0 (advise only) → 5 (autonomous writeback within policy)
- `allowed_data_classes` — what FHIR data classes the agent may retrieve
- `allowed_tools` — what tool ids it may call (`fhir.read`, `rag.query`, ...)
- `purpose_of_use` — required HL7 PurposeOfUse code on the policy gateway
- `requires_human_review` — whether output bypasses Agent Workbench
- `escalation` — risk threshold + destination queue

## Agent output schema

```ts
type AgentOutput = {
  summary: string;
  recommendation?: string;
  evidence: SourceReference[];          // FHIR resource refs + offsets
  confidence: number;                   // 0..1
  risk_level: "low" | "moderate" | "high";
  required_human_action: "review" | "approve" | "none";
  write_back?: { resource: string; payload: unknown };
  audit_id: string;                     // emitted before output is returned
};
```

## FHIR Subscription triggers

The orchestrator subscribes to:

- New abnormal Observation
- New DiagnosticReport with critical flag
- MedicationRequest gap (no refill within N days)
- Overdue care-plan goal
- High-pain-score Observation (specialty-templated rule)
