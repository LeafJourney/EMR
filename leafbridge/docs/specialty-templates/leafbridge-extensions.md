# Authoring LeafBridge sections on a Specialty Template

LeafBridge layers three optional sections onto the upstream Specialty
Template manifest. All three are additive — existing manifests without
these sections continue to validate unchanged.

This guide walks each section with the Pain Management (non-cannabis)
template as the running example.

## 1. `agents[]`

Lives on the **Specialty Template manifest**. Defines the agent set the
template ships with.

```yaml
agents:
  - id: previsit_summary
    autonomy_tier: 2            # 0..5 — see autonomy table below
    modality: ~                 # ~ = always enabled; or a modality slug
    allowed_data_classes:
      - conditions
      - medications
      - observations
      - documents
    allowed_tools:
      - fhir.read
      - rag.query
    purpose_of_use: treatment
    requires_human_review: true
    escalation:
      on_risk_above: moderate
      route_to: clinical_triage_queue
```

### Field reference

| Field | Required | Notes |
| -- | -- | -- |
| `id` | yes | Snake-case slug, stable forever |
| `autonomy_tier` | yes | Integer 0–5. Higher tier = more permitted write-back |
| `modality` | no | Modality slug or null. When set, agent is hidden if `isModalityEnabled(practiceId, modality) === false` |
| `allowed_data_classes` | yes | Non-empty subset of the registered data classes |
| `allowed_tools` | yes | Non-empty list of tool ids the agent may call |
| `purpose_of_use` | yes | One of the HL7 PurposeOfUse codes |
| `requires_human_review` | yes | Booleam — when true, output queued for the Agent Workbench |
| `escalation` | no | Risk threshold + destination queue |

### Autonomy tier table

| Tier | What the agent can do |
| -- | -- |
| 0 | Read-only retrieval, advisory output, no write |
| 1 | Draft for human review |
| 2 | Draft + auto-route to a queue |
| 3 | Auto-write low-risk artifacts within `writeback_policy` |
| 4 | Auto-write within policy, with delayed human audit |
| 5 | Fully autonomous within policy — reserved, not enabled in v0.1 |

## 2. `agent_enable_overrides`

Lives on the **Practice Configuration**. Lets a practice override an
agent's default state without forking the template.

```yaml
agent_enable_overrides:
  previsit_summary: enabled
  opioid_risk_review: disabled
```

Values: `enabled` or `disabled`. The merge rule:

| Template default | Practice override | Effective |
| -- | -- | -- |
| enabled | (unset) | enabled |
| enabled | enabled | enabled |
| enabled | disabled | disabled |
| disabled (via modality gate) | enabled | enabled IF modality enabled, else disabled |

Modality-gated agents always respect the modality gate, even when the
practice explicitly enables them. (You cannot opt into the
`cannabis_certification_drafter` agent without enabling the
`cannabis-medicine` modality first.)

## 3. `clinical_routing_rules[]`

Lives on **both** the template (default) and the practice configuration
(override). FHIR-Subscription-triggered. Rule shape:

```yaml
clinical_routing_rules:
  - name: high_pain_score
    when:
      resource: Observation
      code: pain_score
      predicate: { value_greater_than: 8 }
    then:
      route_to: clinical_triage_queue
      priority: high              # routine | high | urgent | stat
      trigger_agent: opioid_risk_review  # optional
```

Predicate operators supported in v0.1:

- `value_greater_than: <number>`
- `value_less_than: <number>`
- `value_equal_to: <string | number | boolean>`
- `value_in: [<string>, ...]`
- `code_in: [<string>, ...]`
- `status_equal_to: <string>`

Multiple predicates AND together.

## 4. `writeback_policy`

Lives on **both** template and practice config.

```yaml
writeback_policy:
  allowed_resources:
    - CarePlan
    - ServiceRequest
    - DocumentReference
  requires_approval: true
  max_autonomy_tier: 3
```

Consumed by the Consent & Policy Gateway. The controller stores the policy
but never enforces it — enforcement is at the gateway.

## Merging template + practice override

For both `clinical_routing_rules[]` and `writeback_policy`, the practice
config (when set) **replaces** the template default. Append-semantics are
out of scope for v0.1.

## Modality gate semantics

Identical to the upstream module gate from [EMR-411](https://linear.app/emr-project/issue/EMR-411).
Calling `isModalityEnabled(practiceId, agent.modality)` returns:

- `true` if `agent.modality === null`
- `true` if `agent.modality` is in `enabled_modalities`
- `false` if `agent.modality` is in `disabled_modalities`
- `false` if `agent.modality` is unknown (defensive default)

The same gate filters UI modules, so a cannabis-bleed regression is
identical between agents and the UI.

## Full example

[`packages/specialty-dsl/examples/pain-management-extensions.yaml`](../../packages/specialty-dsl/examples/pain-management-extensions.yaml)
is the Pain Management (non-cannabis) v0.1 set: three agents, one
high-pain-score routing rule, a treatment write-back policy.
