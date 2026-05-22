# Conformance tests

Every Tier A FHIR example file in `examples/fhir-resources/` must validate
against its declared US Core profile. The conformance runner reads each
example, finds its `meta.profile[0]`, and calls HAPI's `$validate`
operation.

Phase 0 ships the runner as a placeholder; Phase 1 plugs in a real HAPI
container and the US Core 6.1.0 profile bundle.
