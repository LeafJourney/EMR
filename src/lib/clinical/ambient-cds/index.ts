// ---------------------------------------------------------------------------
// Ambient Clinical Intelligence — public surface (epic EMR-1118).
//
// Barrel for the wearable-augmented insulin-resistance engine (EMR-1127),
// telemetry normalization, and the FHIR Clinical Reasoning serializers
// (EMR-1130). The inline-highlight UI (EMR-1128) and any server action that
// assembles a patient's biomarker + telemetry profile import from here.
// ---------------------------------------------------------------------------

export * from "./types";
export * from "./normalize";
export * from "./ir-risk";
export * from "./fhir";
export * from "./lab-profile";
export * from "./interventions";
