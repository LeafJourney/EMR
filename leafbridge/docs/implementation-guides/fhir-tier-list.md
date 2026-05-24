# FHIR resource tier list — Phase 0.7 (EMR-777)

What we support, when. Ratified at the close of Phase 0.

## Tier A — MVP (must ship in v0.1)

| Domain | Resource | US Core profile (6.1.0) |
| -- | -- | -- |
| Identity | `Patient` | us-core-patient |
| Identity | `Practitioner` | us-core-practitioner |
| Identity | `Organization` | us-core-organization |
| Encounters | `Encounter` | us-core-encounter |
| Clinical facts | `Condition` | us-core-condition-encounter-diagnosis |
| Clinical facts | `Observation` (vitals, labs, social, clinical-result) | us-core-observation-* (per category) |
| Medications | `MedicationRequest` | us-core-medicationrequest |
| Labs | `DiagnosticReport` | us-core-diagnosticreport-lab |
| Documents | `DocumentReference` | us-core-documentreference |
| Documents | `Binary` | base FHIR R4 |
| Governance | `Consent` | base FHIR R4 |
| Governance | `Provenance` | base FHIR R4 |
| Governance | `AuditEvent` | base FHIR R4 + LeafBridge extensions |

## Tier B — Phase 1 expansion

| Domain | Resource |
| -- | -- |
| Identity | `RelatedPerson` |
| Encounters | `EpisodeOfCare` |
| Medications | `MedicationStatement`, `MedicationDispense` |
| Procedures | `Procedure` |
| Labs | `Specimen` |
| Documents | `Composition` |
| Care plans | `CarePlan`, `Goal`, `ServiceRequest` |
| Scheduling | `Appointment`, `Schedule`, `Slot` |

## Tier C — Later

| Domain | Resource |
| -- | -- |
| Billing | `Coverage`, `Claim`, `ExplanationOfBenefit` |
| Imaging | `ImagingStudy` |
| Devices | `Device`, `DeviceUseStatement` |
| Communication | `Communication`, `CommunicationRequest` |
| Population health | `Group`, `Measure`, `MeasureReport` |

## Per-Tier-A doc requirements

For every Tier A resource we maintain:

- US Core profile constraints documented in `./fhir-resources/{Resource}.md`
- Required fields + cardinalities
- Search parameters supported in MVP (see [./search-parameter-matrix.md](./search-parameter-matrix.md))
- A synthetic example committed under `examples/fhir-resources/`
- Validation rules wired up in the fhir-server-adapter
