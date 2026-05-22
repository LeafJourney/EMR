# Consent

**Profile:** base FHIR R4 — Consent has no US Core profile in 6.1.0. We
constrain locally to keep the policy-gateway logic tractable.

## Required fields

| Path | Cardinality | Notes |
| -- | -- | -- |
| `status` | 1..1 | `draft`, `active`, `inactive`, `entered-in-error`, `rejected` |
| `scope` | 1..1 | `patient-privacy`, `treatment`, `research`, `adr` |
| `category` | 1..* | At least one of `INFAO`, `INFASO`, `IRDSRE`, `RESEARCH`, `RSDID`, `RSREID` (HL7 ActConsentDirective) |
| `patient` | 1..1 | Reference(Patient) |
| `dateTime` | 0..1 | When the consent was recorded |
| `policyRule` | 0..1 | URI naming the governing policy |
| `provision.type` | 0..1 | `permit` \| `deny` |
| `provision.period` | 0..1 | effective window |
| `provision.purpose` | 0..* | PurposeOfUse codes |
| `provision.class` | 0..* | resource classes covered |

## Search parameters (MVP)

See [../search-parameter-matrix.md#consent](../search-parameter-matrix.md#consent).

## Validation rules

1. A `permit` provision must specify either purpose or class — both empty
   is rejected.
2. `status = active` requires non-null `provision.period.start`.
3. Sensitive categories (BH, SUD, reproductive) require explicit
   provisions; default-deny otherwise.

## Example

[`examples/fhir-resources/Consent.example.json`](../../../examples/fhir-resources/Consent.example.json)
