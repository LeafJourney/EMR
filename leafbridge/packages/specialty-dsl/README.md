# @leafbridge/specialty-dsl

LeafBridge extensions to the upstream **Specialty Template manifest**
([EMR-408](https://linear.app/emr-project/issue/EMR-408/epic-2-specialty-template-registry))
and **Practice Configuration Object**
([EMR-409](https://linear.app/emr-project/issue/EMR-409/epic-3-practice-configuration-object)).

This package does **not** introduce a new manifest format. It exposes the
three optional sections that LeafBridge needs on top of the existing schema:

- `agents[]` — agent registration on the template
- `agent_enable_overrides` — per-practice agent on/off
- `clinical_routing_rules[]` — FHIR-Subscription-triggered routing
- `writeback_policy` — what agents may write back, under what review

Single source of truth: the per-practice runtime config still lives on
`PracticeConfiguration` and is read via the typed `getPracticeConfig(practiceId)`
client. LeafBridge services never introduce a parallel config store.

## Usage (Node / TypeScript)

```ts
import {
  LeafBridgeManifestExtensionsSchema,
  type LeafBridgeManifestExtensions,
} from "@leafbridge/specialty-dsl";

const parsed = LeafBridgeManifestExtensionsSchema.parse(rawYaml);
```

## Usage (JSON Schema)

```bash
ajv validate -s schemas/manifest-extensions.json -d my-template.yaml
```

The JSON Schema mirrors the Zod schema. They are kept in sync via the
package's test suite.
