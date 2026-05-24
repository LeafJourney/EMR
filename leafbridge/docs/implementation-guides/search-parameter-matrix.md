# FHIR search parameter matrix — Tier A (EMR-777)

The minimum search parameters supported in v0.1 per Tier A resource.
Additional parameters can be added without a profile bump; removing one
requires an ADR.

## Patient
| Parameter | Type | Notes |
| -- | -- | -- |
| `_id` | token | |
| `identifier` | token | MRN, SSN-last-4, etc. |
| `name` | string | given + family |
| `family` | string | |
| `given` | string | |
| `birthdate` | date | |
| `gender` | token | |
| `_lastUpdated` | date | |

## Practitioner
| Parameter | Type |
| -- | -- |
| `_id` | token |
| `identifier` | token |
| `name` | string |
| `_lastUpdated` | date |

## Organization
| Parameter | Type |
| -- | -- |
| `_id` | token |
| `identifier` | token |
| `name` | string |

## Encounter
| Parameter | Type | Notes |
| -- | -- | -- |
| `_id` | token | |
| `patient` | reference | |
| `date` | date | period.start |
| `status` | token | |
| `class` | token | |
| `type` | token | |
| `_lastUpdated` | date | |

## Condition
| Parameter | Type | Notes |
| -- | -- | -- |
| `_id` | token | |
| `patient` | reference | |
| `encounter` | reference | |
| `code` | token | |
| `category` | token | |
| `clinical-status` | token | |
| `onset-date` | date | |
| `_lastUpdated` | date | |

## Observation
| Parameter | Type | Notes |
| -- | -- | -- |
| `_id` | token | |
| `patient` | reference | |
| `encounter` | reference | |
| `code` | token | LOINC primarily |
| `category` | token | |
| `date` | date | effective |
| `value-quantity` | quantity | range comparisons |
| `status` | token | |
| `_lastUpdated` | date | |

## MedicationRequest
| Parameter | Type | Notes |
| -- | -- | -- |
| `_id` | token | |
| `patient` | reference | |
| `encounter` | reference | |
| `status` | token | |
| `intent` | token | |
| `authoredon` | date | |
| `code` | token | RxNorm |

## DiagnosticReport
| Parameter | Type | Notes |
| -- | -- | -- |
| `_id` | token | |
| `patient` | reference | |
| `encounter` | reference | |
| `category` | token | |
| `code` | token | LOINC |
| `date` | date | effective |
| `issued` | date | |
| `status` | token | |

## DocumentReference
| Parameter | Type | Notes |
| -- | -- | -- |
| `_id` | token | |
| `patient` | reference | |
| `encounter` | reference | |
| `type` | token | LOINC document type |
| `category` | token | |
| `date` | date | |
| `status` | token | |

## Binary
| Parameter | Type |
| -- | -- |
| `_id` | token |

## Consent
| Parameter | Type | Notes |
| -- | -- | -- |
| `_id` | token | |
| `patient` | reference | |
| `status` | token | |
| `category` | token | |
| `scope` | token | |
| `period` | date | effective period |
| `purpose` | token | |

## Provenance
| Parameter | Type |
| -- | -- |
| `_id` | token |
| `target` | reference |
| `recorded` | date |
| `agent` | reference |

## AuditEvent
| Parameter | Type | Notes |
| -- | -- | -- |
| `_id` | token | |
| `patient` | reference | |
| `agent` | reference | |
| `date` | date | recorded |
| `action` | token | C/R/U/D/E |
| `outcome` | token | |
| `entity` | reference | what was touched |
