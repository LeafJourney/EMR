# Encounter

**US Core profile:** [us-core-encounter](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-encounter.html)

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `status` | 1..1 | `planned`, `arrived`, `triaged`, `in-progress`, `onleave`, `finished`, `cancelled` |
| `class` | 1..1 | v3-ActEncounterCode (AMB, EMER, IMP, ...) |
| `type` | 1..* | LOINC encounter type |
| `subject` | 1..1 | Reference(Patient) |
| `participant` | 0..* | Practitioner; must-support |
| `period` | 0..1 | start + end |
| `serviceProvider` | 0..1 | Reference(Organization) |

## Search parameters (MVP)

See [../search-parameter-matrix.md#encounter](../search-parameter-matrix.md#encounter).

## Validation rules

1. Reject if `subject` does not resolve to an existing Patient.
2. Reject if `class` is not in the v3-ActEncounterCode value set.
3. Soft-warn if `period.start` > `period.end`.

## Example

[`examples/fhir-resources/Encounter.example.json`](../../../examples/fhir-resources/Encounter.example.json)
