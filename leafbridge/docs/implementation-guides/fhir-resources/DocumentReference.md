# DocumentReference

**US Core profile:** [us-core-documentreference](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-documentreference.html)

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `status` | 1..1 | `current`, `superseded`, `entered-in-error` |
| `type` | 1..1 | LOINC document type |
| `category` | 1..* | US Core document category |
| `subject` | 1..1 | Reference(Patient) |
| `date` | 0..1 | |
| `author` | 0..* | Practitioner / Organization |
| `content` | 1..* | At least one attachment with `contentType` + (`data` or `url`) |
| `context.encounter` | 0..* | |
| `meta.security` | 0..* | Used by the consent-service to flag sensitive content |

## Search parameters (MVP)

See [../search-parameter-matrix.md#documentreference](../search-parameter-matrix.md#documentreference).

## Validation rules

1. At least one `content.attachment` must carry `data` or `url`.
2. If `meta.security` includes a sensitive code, retrieval is filtered by
   the consent-service.
3. Binary blobs are stored in MinIO; the DocumentReference carries the
   pointer + SHA-256 hash for integrity verification.

## Example

[`examples/fhir-resources/DocumentReference.example.json`](../../../examples/fhir-resources/DocumentReference.example.json)
