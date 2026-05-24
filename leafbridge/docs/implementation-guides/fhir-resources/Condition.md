# Condition

**US Core profile:** [us-core-condition-encounter-diagnosis](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-condition-encounter-diagnosis.html)

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `clinicalStatus` | 1..1 | `active`, `recurrence`, `relapse`, `inactive`, `remission`, `resolved` |
| `verificationStatus` | 1..1 | `unconfirmed`, `provisional`, `differential`, `confirmed`, `refuted`, `entered-in-error` |
| `category` | 1..1 | `encounter-diagnosis` or `problem-list-item` |
| `code` | 1..1 | ICD-10-CM or SNOMED |
| `subject` | 1..1 | Reference(Patient) |
| `encounter` | 0..1 | Reference(Encounter); required if category is `encounter-diagnosis` |
| `onset[x]` | 0..1 | datetime or string |
| `recordedDate` | 0..1 | |

## Search parameters (MVP)

See [../search-parameter-matrix.md#condition](../search-parameter-matrix.md#condition).

## Validation rules

1. Reject if `category = encounter-diagnosis` and `encounter` is missing.
2. Code must be in the ICD-10-CM or SNOMED CT value set.

## Example

[`examples/fhir-resources/Condition.example.json`](../../../examples/fhir-resources/Condition.example.json)
