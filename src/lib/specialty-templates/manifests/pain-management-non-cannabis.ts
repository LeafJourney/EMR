/**
 * Pain Management (non-cannabis) specialty manifest — EMR-408
 *
 * P0 acceptance gate for Practice Onboarding Controller v1.
 *
 * "cannabis-medicine" MUST appear in default_disabled_modalities, not just be
 * absent from default_enabled_modalities. This is the explicit bleed gate
 * that prevents cannabis-specific UI / workflows from appearing in a
 * pain-management practice that has not opted in.
 */

// TODO(EMR-429): integrate once the manifest-schema branch lands.
import type { SpecialtyManifest } from "@/lib/specialty-templates/manifest-schema";

const painManagementNonCannabis: SpecialtyManifest = {
  name: "Pain Management",
  slug: "pain-management-non-cannabis",
  description:
    "Longitudinal interventional pain practice. Pain-specific medications, " +
    "interventional procedures, imaging-driven workup, physical-therapy " +
    "referrals, and functional-pain outcome tracking. Cannabis-medicine is " +
    "explicitly disabled at the modality gate — practices that want a " +
    "cannabis arm must opt in via a separate specialty template.",
  icon: "activity",
  version: "1.0.0",
  default_care_model: "longitudinal-interventional",
  default_workflows: [
    "new-pain-consult",
    "pain-followup",
    "procedure-note",
    "imaging-review",
    "medication-review",
  ],
  default_modules: [
    "scheduling",
    "charting",
    "imaging",
    "procedures",
    "e-prescribing-controlled",
    "referrals",
    "patient-portal",
    "billing",
    "pdmp-check",
  ],
  default_charting_templates: [
    "pain-consult",
    "pain-followup",
    "procedure-note",
  ],
  default_mission_control_cards: [
    "todays-schedule",
    "procedure-board",
    "open-charts",
    "imaging-pending-review",
    "controlled-substance-monitoring",
    "messages-inbox",
    "refill-requests",
  ],
  default_patient_portal_cards: [
    "upcoming-appointments",
    "pain-diary",
    "functional-goals",
    "medications",
    "messages",
    "billing",
  ],
  default_enabled_modalities: [
    "pain-medications",
    "procedures",
    "imaging",
    "referrals",
    "physical-therapy",
    "functional-pain",
    "patient-reported-outcomes",
  ],
  // P0: cannabis-medicine MUST be present here (explicit disable, not absence).
  default_disabled_modalities: ["cannabis-medicine", "commerce-leafmart"],
  migration_mapping_defaults: {
    pain_score: "pain_scores",
    pain_location: "pain_location",
    pain_quality: "pain_quality",
    pain_radiation: "pain_radiation",
    prior_procedures: "prior_procedures",
    imaging_history: "imaging_history",
    medication_history: "medication_history",
    functional_limitations: "functional_limitations",
    prior_treatment_response: "prior_treatment_response",
    pdmp_history: "pdmp_history",
  },
  // LeafBridge extensions (EMR-778). Optional, default-null on manifests
  // that haven't authored them yet.
  agents: [
    {
      id: "previsit_summary",
      autonomy_tier: 2,
      modality: null,
      allowed_data_classes: [
        "conditions",
        "medications",
        "observations",
        "documents",
      ],
      allowed_tools: ["fhir.read", "rag.query"],
      purpose_of_use: "treatment",
      requires_human_review: true,
      escalation: {
        on_risk_above: "moderate",
        route_to: "clinical_triage_queue",
      },
    },
    {
      id: "opioid_risk_review",
      autonomy_tier: 1,
      modality: null,
      allowed_data_classes: [
        "conditions",
        "medications",
        "observations",
        "documents",
      ],
      allowed_tools: ["fhir.read", "rag.query", "pdmp.read"],
      purpose_of_use: "treatment",
      requires_human_review: true,
      escalation: {
        on_risk_above: "low",
        route_to: "controlled_substance_monitoring_queue",
      },
    },
    {
      // Modality-gated. Hidden in any Pain Management practice that hasn't
      // opted into cannabis-medicine. P0 bleed gate.
      id: "cannabis_certification_drafter",
      autonomy_tier: 2,
      modality: "cannabis-medicine",
      allowed_data_classes: [
        "conditions",
        "medications",
        "observations",
        "documents",
      ],
      allowed_tools: ["fhir.read", "rag.query"],
      purpose_of_use: "treatment",
      requires_human_review: true,
    },
  ],
  clinical_routing_rules: [
    {
      name: "high_pain_score",
      when: {
        resource: "Observation",
        code: "pain_score",
        predicate: { value_greater_than: 8 },
      },
      then: {
        route_to: "clinical_triage_queue",
        priority: "high",
        trigger_agent: "opioid_risk_review",
      },
    },
  ],
  writeback_policy: {
    allowed_resources: ["CarePlan", "ServiceRequest", "DocumentReference"],
    requires_approval: true,
    max_autonomy_tier: 3,
  },
};

export default painManagementNonCannabis;
