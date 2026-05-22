# Data classification — EMR-774

Every piece of data in LeafBridge falls into one of four classes. Class
drives encryption, audit, retention, and the agent's
`allowed_data_classes` ceiling.

| Class | Examples | Default access |
| -- | -- | -- |
| **PHI** | demographics, encounters, conditions, observations, medications, labs, documents | role + purpose-of-use + tenant |
| **Sensitive PHI** | behavioral health, substance use (42 CFR Part 2), reproductive, HIV status, minor consent | additional consent required; segmented retrieval |
| **De-identified** | aggregated cohort outputs, research marts post-Safe-Harbor or Expert-Determination | tenant + purpose-of-use=research |
| **Public** | terminology, FHIR profile metadata, agent registry metadata | none |

## Sensitive PHI subclasses

The `allowed_data_classes` enum carries three explicit sensitive subclasses
to make retrieval shape-able:

- `sensitive-behavioral-health`
- `sensitive-sud` (substance use)
- `sensitive-reproductive`

A retrieval call that does not list a sensitive subclass receives a
filtered result with those rows excluded — never silently mixed in.

## "Do not train" tag

Any record tagged `do_not_train` (set per-tenant, per-source, or per-patient
at the consent layer) is dropped from any embedding-export pipeline and
from any external model API call. The tag propagates through every zone.

## Re-identification controls

De-identified marts produced from PHI must:

- Apply HIPAA Safe Harbor de-identification, OR
- Carry an Expert Determination certificate documenting k-anonymity ≥ 5
  (default) for any released subset

Re-identification attempts are audited as `outcome=8` (serious).

## Class → encryption / audit map

| Class | At-rest encryption | Audit on read | Audit on write |
| -- | -- | -- | -- |
| PHI | AES-256, per-tenant KMS | yes | yes |
| Sensitive PHI | AES-256, per-tenant KMS, separate key | yes | yes |
| De-identified | AES-256, shared key | sampled (10%) | yes |
| Public | none required | no | yes |
