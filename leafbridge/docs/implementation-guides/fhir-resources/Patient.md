# Patient

**US Core profile:** [us-core-patient](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-patient.html)

## Required fields (must-support)

| Path | Cardinality | Notes |
| -- | -- | -- |
| `identifier` | 1..* | At least one identifier (typically MRN). Each must have `system` and `value`. |
| `name` | 1..* | At least one `HumanName` with `family` and `given`. |
| `gender` | 1..1 | `male` \| `female` \| `other` \| `unknown` |
| `birthDate` | 0..1 | Required by US Core if known |
| `address` | 0..* | Must-support |
| `telecom` | 0..* | Must-support |
| `extension:race` | 0..* | us-core-race |
| `extension:ethnicity` | 0..* | us-core-ethnicity |
| `extension:birthsex` | 0..1 | us-core-birthsex |

## Search parameters (MVP)

See [../search-parameter-matrix.md#patient](../search-parameter-matrix.md#patient).

## Validation rules (fhir-server-adapter hooks)

1. Reject if no `identifier` carries `system = MRN`.
2. Reject if `birthDate` is in the future.
3. Soft-warn if no `address` (US Core "must-support" — present-or-justified).
4. Soft-warn if no telecom.

## Example

[`examples/fhir-resources/Patient.example.json`](../../../examples/fhir-resources/Patient.example.json)
