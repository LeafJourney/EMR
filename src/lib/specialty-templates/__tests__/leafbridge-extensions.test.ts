/**
 * LeafBridge manifest extensions — EMR-778 conformance tests.
 *
 * Covers:
 *   1. Manifest schema accepts the three optional LeafBridge sections
 *      (agents[], clinical_routing_rules[], writeback_policy) without
 *      breaking existing v1 manifests.
 *   2. Validator rejects malformed agent / rule / writeback shapes at
 *      registration time.
 *   3. resolveEffectiveAgents() merges template defaults with practice
 *      overrides correctly.
 *   4. Modality gate semantics: agents declaring a modality are hidden
 *      from any practice where that modality is not enabled — even when
 *      the practice's `agent_enable_overrides` explicitly enables them.
 *      Mirrors the EMR-414 cannabis-bleed P0 gate, applied to agents.
 */

import { describe, expect, it } from "vitest";

import {
  AgentDescriptorSchema,
  ClinicalRoutingRuleSchema,
  WritebackPolicySchema,
  validateManifest,
  type SpecialtyManifest,
} from "@/lib/specialty-templates/manifest-schema";
import {
  getSpecialtyTemplate,
  resolveEffectiveAgents,
} from "@/lib/specialty-templates/registry";

const baseManifest = (
  overrides: Partial<SpecialtyManifest> & { slug: string; version: string },
): unknown => ({
  name: "LeafBridge Extension Fixture",
  description: "Fixture used by EMR-778 conformance tests.",
  icon: "test-tube",
  default_care_model: "longitudinal-primary-care",
  default_workflows: [],
  default_modules: [],
  default_charting_templates: [],
  default_mission_control_cards: [],
  default_patient_portal_cards: [],
  default_enabled_modalities: [],
  default_disabled_modalities: [],
  migration_mapping_defaults: {},
  ...overrides,
});

describe("LeafBridge manifest extensions (EMR-778)", () => {
  it("accepts a manifest with no LeafBridge sections (backwards compatible)", () => {
    const result = validateManifest(
      baseManifest({ slug: "lb-ext-none", version: "1.0.0" }),
    );
    expect(result.ok).toBe(true);
  });

  it("accepts a manifest with agents[], clinical_routing_rules[], writeback_policy", () => {
    const result = validateManifest(
      baseManifest({
        slug: "lb-ext-full",
        version: "1.0.0",
        agents: [
          {
            id: "previsit_summary",
            autonomy_tier: 2,
            modality: null,
            allowed_data_classes: ["conditions", "medications"],
            allowed_tools: ["fhir.read"],
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
            then: { route_to: "clinical_triage_queue", priority: "high" },
          },
        ],
        writeback_policy: {
          allowed_resources: ["CarePlan"],
          requires_approval: true,
          max_autonomy_tier: 3,
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects an agent with an unknown data class", () => {
    const result = AgentDescriptorSchema.safeParse({
      id: "bad_agent",
      autonomy_tier: 2,
      allowed_data_classes: ["nope-not-a-class"],
      allowed_tools: ["fhir.read"],
      purpose_of_use: "treatment",
      requires_human_review: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an agent id that is not snake_case", () => {
    const result = AgentDescriptorSchema.safeParse({
      id: "BadAgent-ID",
      autonomy_tier: 2,
      allowed_data_classes: ["conditions"],
      allowed_tools: ["fhir.read"],
      purpose_of_use: "treatment",
      requires_human_review: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an autonomy_tier outside 0..5", () => {
    const result = AgentDescriptorSchema.safeParse({
      id: "tier_too_high",
      autonomy_tier: 6,
      allowed_data_classes: ["conditions"],
      allowed_tools: ["fhir.read"],
      purpose_of_use: "treatment",
      requires_human_review: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a routing rule whose predicate is empty", () => {
    const result = ClinicalRoutingRuleSchema.safeParse({
      name: "empty_predicate",
      when: { resource: "Observation", code: "x", predicate: {} },
      then: { route_to: "q", priority: "routine" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a writeback policy with an empty allowed_resources list", () => {
    const result = WritebackPolicySchema.safeParse({
      allowed_resources: [],
      requires_approval: true,
      max_autonomy_tier: 2,
    });
    expect(result.success).toBe(false);
  });
});

describe("Pain Management v1 ships the EMR-778 agent set", () => {
  it("manifest carries previsit_summary, opioid_risk_review, and cannabis_certification_drafter", () => {
    const pm = getSpecialtyTemplate("pain-management-non-cannabis");
    expect(pm).not.toBeNull();
    expect(pm!.agents).toBeDefined();
    const ids = pm!.agents!.map((a) => a.id).sort();
    expect(ids).toEqual([
      "cannabis_certification_drafter",
      "opioid_risk_review",
      "previsit_summary",
    ]);
  });

  it("declares the high_pain_score routing rule", () => {
    const pm = getSpecialtyTemplate("pain-management-non-cannabis");
    expect(pm).not.toBeNull();
    const rule = pm!.clinical_routing_rules?.find((r) => r.name === "high_pain_score");
    expect(rule).toBeDefined();
    expect(rule!.then.route_to).toBe("clinical_triage_queue");
    expect(rule!.then.priority).toBe("high");
  });

  it("declares a write-back policy with CarePlan / ServiceRequest / DocumentReference", () => {
    const pm = getSpecialtyTemplate("pain-management-non-cannabis");
    expect(pm).not.toBeNull();
    expect(pm!.writeback_policy?.allowed_resources).toEqual(
      expect.arrayContaining(["CarePlan", "ServiceRequest", "DocumentReference"]),
    );
    expect(pm!.writeback_policy?.requires_approval).toBe(true);
  });
});

describe("Internal Medicine v1 ships the EMR-778 agent set", () => {
  it("manifest carries previsit_summary, med_reconciliation, lab_trend_summary", () => {
    const im = getSpecialtyTemplate("internal-medicine");
    expect(im).not.toBeNull();
    expect(im!.agents).toBeDefined();
    const ids = im!.agents!.map((a) => a.id).sort();
    expect(ids).toEqual(["lab_trend_summary", "med_reconciliation", "previsit_summary"]);
  });
});

describe("resolveEffectiveAgents (EMR-778)", () => {
  it("returns the full agent set for a Pain Management practice with default modalities", () => {
    const agents = resolveEffectiveAgents({
      slug: "pain-management-non-cannabis",
      enabledModalities: new Set([
        "pain-medications",
        "procedures",
        "imaging",
        "referrals",
        "physical-therapy",
        "functional-pain",
        "patient-reported-outcomes",
      ]),
    });
    const ids = agents.map((a) => a.id).sort();
    // cannabis_certification_drafter is gated; cannabis-medicine not enabled → hidden.
    expect(ids).toEqual(["opioid_risk_review", "previsit_summary"]);
  });

  it("HIDES the cannabis-medicine-gated agent in a Pain Management practice (P0 bleed gate)", () => {
    const agents = resolveEffectiveAgents({
      slug: "pain-management-non-cannabis",
      enabledModalities: new Set(["pain-medications"]),
    });
    const ids = agents.map((a) => a.id);
    expect(ids).not.toContain("cannabis_certification_drafter");
  });

  it("INCLUDES the cannabis-medicine-gated agent when the practice opts into cannabis-medicine", () => {
    const agents = resolveEffectiveAgents({
      slug: "pain-management-non-cannabis",
      enabledModalities: new Set([
        "pain-medications",
        "cannabis-medicine",
      ]),
    });
    const ids = agents.map((a) => a.id);
    expect(ids).toContain("cannabis_certification_drafter");
  });

  it("modality gate beats an explicit `enabled` override (modality gate always wins)", () => {
    const agents = resolveEffectiveAgents({
      slug: "pain-management-non-cannabis",
      enabledModalities: new Set(["pain-medications"]),
      // Practice tries to force-enable the cannabis agent. Should still be hidden.
      practiceOverrides: { cannabis_certification_drafter: "enabled" },
    });
    const ids = agents.map((a) => a.id);
    expect(ids).not.toContain("cannabis_certification_drafter");
  });

  it("practice override `disabled` hides an otherwise-enabled agent", () => {
    const agents = resolveEffectiveAgents({
      slug: "pain-management-non-cannabis",
      enabledModalities: new Set([
        "pain-medications",
        "cannabis-medicine",
      ]),
      practiceOverrides: { opioid_risk_review: "disabled" },
    });
    const ids = agents.map((a) => a.id);
    expect(ids).not.toContain("opioid_risk_review");
  });

  it("returns [] for a slug with no agents", () => {
    const agents = resolveEffectiveAgents({
      slug: "veterinary-medicine",
      enabledModalities: new Set([]),
    });
    expect(agents).toEqual([]);
  });

  it("returns [] for an unknown slug", () => {
    const agents = resolveEffectiveAgents({
      slug: "nope-not-real",
      enabledModalities: new Set([]),
    });
    expect(agents).toEqual([]);
  });
});
