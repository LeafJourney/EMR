# consent-service

**Module 5a.** FHIR `Consent` resource CRUD. Purpose-of-use enforcement.
Sensitive-data segmentation (42 CFR Part 2, behavioral health, reproductive).

## Contracts

- `POST /Consent` — create
- `GET /Consent/{id}` — read
- `PUT /Consent/{id}` — supersede (creates a new version, never overwrites)
- `GET /Consent?patient=...&purpose=...&category=...` — query

## Enforcement seam

The consent-service is the source of truth for *what is allowed*. The
[policy-gateway](../policy-gateway/) is the *decision point* and the
[fhir-server-adapter](../fhir-server-adapter/) is the *enforcement point*.

No service may call FHIR storage directly without passing through the policy
gateway. The gateway calls consent-service for the consent state at retrieval
time, never caches it past the request.
