# MedicationRequest

**US Core profile:** [us-core-medicationrequest](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-medicationrequest.html)

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `status` | 1..1 | `active`, `on-hold`, `cancelled`, `completed`, `entered-in-error`, `stopped`, `draft`, `unknown` |
| `intent` | 1..1 | `proposal`, `plan`, `order`, `original-order`, `reflex-order`, `filler-order`, `instance-order`, `option` |
| `medication[x]` | 1..1 | RxNorm in CodeableConcept, or Reference(Medication) |
| `subject` | 1..1 | Reference(Patient) |
| `encounter` | 0..1 | |
| `authoredOn` | 0..1 | Must-support |
| `requester` | 0..1 | Practitioner |
| `dosageInstruction` | 0..* | Must-support |
| `reportedBoolean` | 0..1 | `true` = stated by the patient/source, not prescribed by us |

## Search parameters (MVP)

See [../search-parameter-matrix.md#medicationrequest](../search-parameter-matrix.md#medicationrequest).

## Validation rules

1. Medication code must be RxNorm or in the partner-mapping table.
2. `status = active` requires `dosageInstruction` (or a documented PRN).

## Example

[`examples/fhir-resources/MedicationRequest.example.json`](../../../examples/fhir-resources/MedicationRequest.example.json)
