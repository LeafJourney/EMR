# @leafbridge/agent-sdk

Shared types and helpers for building LeafBridge agents. The descriptor
shape is re-exported from `@leafbridge/specialty-dsl`; this package adds the
agent **output** schema, autonomy-tier semantics, and the registry helpers.

## Output schema

```ts
import { AgentOutputSchema } from "@leafbridge/agent-sdk";

const parsed = AgentOutputSchema.parse(rawAgentOutput);
```

Every agent return value flows through `AgentOutputSchema` before the
orchestrator writes it to the audit ledger or the human-review queue. The
schema enforces:

- `evidence` is non-empty (every output must cite at least one source FHIR
  resource — backs the "no naked prompts" invariant)
- `audit_id` is set (audit row exists *before* output is returned)
- `risk_level` is one of `low | moderate | high`
- `required_human_action` is one of `none | review | approve`

## Autonomy tiers

| Tier | What the agent can do |
| -- | -- |
| 0 | Read-only retrieval, advisory output, no write |
| 1 | Draft for human review |
| 2 | Draft + auto-route to a queue |
| 3 | Auto-write low-risk artifacts (notes, summaries) within `writeback_policy` |
| 4 | Auto-write within policy, with delayed human audit |
| 5 | Fully autonomous within policy — reserved, not enabled in v0.1 |

Tier ceilings are enforced by the policy-gateway against the practice's
`writeback_policy.max_autonomy_tier`.
