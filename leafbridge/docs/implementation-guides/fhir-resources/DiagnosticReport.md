# DiagnosticReport

**US Core profile:** [us-core-diagnosticreport-lab](https://hl7.org/fhir/us/core/STU6.1/StructureDefinition-us-core-diagnosticreport-lab.html)

(Note: US Core ships a separate `us-core-diagnosticreport-note` profile for
narrative diagnostic reports; we will adopt it in Phase 1.)

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `status` | 1..1 | `registered`, `partial`, `preliminary`, `final`, `amended`, `corrected`, `appended`, `cancelled`, `entered-in-error`, `unknown` |
| `category` | 1..* | Must include `LAB` (or LOINC `LP43594-3`) for the lab profile |
| `code` | 1..1 | LOINC |
| `subject` | 1..1 | Reference(Patient) |
| `encounter` | 0..1 | |
| `effective[x]` | 1..1 | |
| `issued` | 0..1 | |
| `performer` | 0..* | |
| `result` | 0..* | Reference(Observation) — the individual lab values |

## Search parameters (MVP)

See [../search-parameter-matrix.md#diagnosticreport](../search-parameter-matrix.md#diagnosticreport).

## Validation rules

1. Each Reference in `result` must resolve to an Observation with category
   `laboratory`.
2. `status = final` requires `issued`.

## Example

[`examples/fhir-resources/DiagnosticReport.example.json`](../../../examples/fhir-resources/DiagnosticReport.example.json)
