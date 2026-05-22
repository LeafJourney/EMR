# Binary

**Profile:** base FHIR R4 (US Core does not profile Binary).

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `contentType` | 1..1 | MIME type |
| `data` | 0..1 | Base64-encoded inline payload (small files only) |

For attachments larger than 5 MiB we store the payload in MinIO and the
Binary resource carries `meta.tag` with a `leafbridge-storage-url` pointer.
The fhir-server-adapter resolves the pointer on read.

## Search parameters (MVP)

| Parameter | Type |
| -- | -- |
| `_id` | token |

## Validation rules

1. Reject if `contentType` is empty.
2. Inline `data` ≤ 5 MiB; larger payloads must use the MinIO pointer
   pattern.

## Example

[`examples/fhir-resources/Binary.example.json`](../../../examples/fhir-resources/Binary.example.json)
