# Observation

US Core ships per-category Observation profiles. We carry all four for v0.1:

- [us-core-observation-vital-signs](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-vital-signs.html) — heart rate, BP, temp, etc.
- [us-core-observation-lab](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-observation-lab.html) — lab results
- [us-core-observation-social-history](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-observation-social-history.html) — smoking, etc.
- [us-core-observation-clinical-result](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-observation-clinical-result.html) — everything else (incl. pain score, PROMs)

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `status` | 1..1 | `registered`, `preliminary`, `final`, `amended`, `corrected`, `cancelled`, `entered-in-error`, `unknown` |
| `category` | 1..* | At least one of the four categories above |
| `code` | 1..1 | LOINC primarily |
| `subject` | 1..1 | Reference(Patient) |
| `effective[x]` | 1..1 | dateTime or Period |
| `value[x]` | 0..1 | One of valueQuantity, valueCodeableConcept, valueString, valueBoolean, valueInteger, valueRange, valueRatio, valueSampledData, valueTime, valueDateTime, valuePeriod. Mutually exclusive with `dataAbsentReason`. |
| `dataAbsentReason` | 0..1 | When `value[x]` is absent |
| `component` | 0..* | For composite observations (e.g. blood pressure → systolic + diastolic) |

## Search parameters (MVP)

See [../search-parameter-matrix.md#observation](../search-parameter-matrix.md#observation).

## Validation rules

1. Exactly one of `value[x]` or `dataAbsentReason` (US Core invariant).
2. For category `laboratory`, the code must be a LOINC code or a code in
   the partner-mapping table.
3. For pain-score observations (used by the routing rule), code must be
   `38208-5` (LOINC: Pain severity - 0-10 verbal numeric rating).
4. `effectiveDateTime` must not be in the future for `final` status.

## Example

[`examples/fhir-resources/Observation.example.json`](../../../examples/fhir-resources/Observation.example.json)
