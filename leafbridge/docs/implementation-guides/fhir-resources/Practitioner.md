# Practitioner

**US Core profile:** [us-core-practitioner](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-practitioner.html)

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `identifier` | 1..* | At least one NPI (`system = http://hl7.org/fhir/sid/us-npi`) |
| `name` | 1..* | At least one `HumanName` |
| `telecom` | 0..* | Must-support |
| `address` | 0..* | Must-support |

## Search parameters (MVP)

See [../search-parameter-matrix.md#practitioner](../search-parameter-matrix.md#practitioner).

## Validation rules

1. Reject if no NPI identifier.
2. NPI must be 10 digits and pass the Luhn check.

## Example

[`examples/fhir-resources/Practitioner.example.json`](../../../examples/fhir-resources/Practitioner.example.json)
