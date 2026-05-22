# Organization

**US Core profile:** [us-core-organization](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-organization.html)

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `identifier` | 1..* | NPI for healthcare organizations |
| `active` | 1..1 | `true` for production |
| `name` | 1..1 | |
| `telecom` | 0..* | Must-support |
| `address` | 0..* | Must-support |

## Search parameters (MVP)

See [../search-parameter-matrix.md#organization](../search-parameter-matrix.md#organization).

## Validation rules

1. Require NPI identifier or a CLIA / state license identifier.
2. `active = false` removes from the listing UI but does not delete.

## Example

[`examples/fhir-resources/Organization.example.json`](../../../examples/fhir-resources/Organization.example.json)
