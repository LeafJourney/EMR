# Provenance

**Profile:** base FHIR R4. LeafBridge stamps Provenance on every Gold-zone
write so every value links back to its source artifact.

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `target` | 1..* | At least one Reference to the resource(s) this Provenance covers |
| `recorded` | 1..1 | When the Provenance was created |
| `agent` | 1..* | Who acted. `agent.type` distinguishes `human` / `agent` / `system`. `agent.who` references the user / agent / service. |
| `activity` | 0..1 | The transformer that produced the target |
| `entity` | 0..* | Source artifact pointer (MinIO Bronze URL + hash) |
| `signature` | 0..* | Optional digital signature |

## LeafBridge extensions

| Extension | Purpose |
| -- | -- |
| `leafbridge-transformer-chain` | ordered list of registered transformer ids |
| `leafbridge-bronze-pointer` | s3 URL + sha256 hash of the source artifact |

## Search parameters (MVP)

See [../search-parameter-matrix.md#provenance](../search-parameter-matrix.md#provenance).

## Validation rules

1. At least one `agent` with `who` set.
2. At least one `target`.
3. When `activity` is set, the transformer id must be in the registered
   transformer registry.

## Example

[`examples/fhir-resources/Provenance.example.json`](../../../examples/fhir-resources/Provenance.example.json)
