# Specialty Templates

LeafBridge **does not** introduce a parallel manifest format. It extends the
existing Specialty Template manifest ([EMR-408](https://linear.app/emr-project/issue/EMR-408))
and Practice Configuration Object ([EMR-409](https://linear.app/emr-project/issue/EMR-409))
with three optional sections:

| Section | Lives on | Purpose |
| -- | -- | -- |
| `agents[]` | Specialty Template manifest | What agents this specialty exposes by default |
| `agent_enable_overrides` | Practice Configuration | Per-practice enable/disable, no template fork required |
| `clinical_routing_rules[]` | Both (template default, practice override) | FHIR-Subscription-triggered queue routing |
| `writeback_policy` | Both (template default, practice override) | What an agent may write back, under what review, up to what autonomy tier |

The typed shapes live in [`@leafbridge/specialty-dsl`](../../packages/specialty-dsl/).
JSON Schema at [`packages/specialty-dsl/schemas/manifest-extensions.json`](../../packages/specialty-dsl/schemas/manifest-extensions.json).

See [`./leafbridge-extensions.md`](./leafbridge-extensions.md) for the
authoring guide.

See [ADR-0006](../adrs/0006-no-parallel-config-store-extend-practiceconfiguration.md)
for why we extended the existing schemas rather than building a new DSL.
