# Tier A FHIR resource examples

Synthetic examples validated against the US Core 6.1.0 profiles documented
in [`../../docs/implementation-guides/fhir-resources/`](../../docs/implementation-guides/fhir-resources/).

Patient IDs are stable across files so the bundle in
[`../synthetic-patients/patient-001.json`](../synthetic-patients/patient-001.json)
can reference each one.

| File | US Core profile |
| -- | -- |
| `Patient.example.json` | us-core-patient |
| `Practitioner.example.json` | us-core-practitioner |
| `Organization.example.json` | us-core-organization |
| `Encounter.example.json` | us-core-encounter |
| `Condition.example.json` | us-core-condition-encounter-diagnosis |
| `Observation.example.json` | us-core-observation-clinical-result (pain score) |
| `MedicationRequest.example.json` | us-core-medicationrequest |
| `DiagnosticReport.example.json` | us-core-diagnosticreport-lab |
| `DocumentReference.example.json` | us-core-documentreference |
| `Binary.example.json` | base FHIR R4 |
| `Consent.example.json` | base FHIR R4 + LeafBridge constraints |
| `Provenance.example.json` | base FHIR R4 + LeafBridge extensions |
| `AuditEvent.example.json` | base FHIR R4 + LeafBridge extensions |
