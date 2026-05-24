/**
 * @leafbridge/specialty-dsl
 *
 * LeafBridge-specific extensions to the upstream Specialty Template manifest
 * (EMR-408) and Practice Configuration Object (EMR-409). All four sections
 * exposed here are OPTIONAL on the upstream schema — default-null on existing
 * rows, no breaking migration.
 *
 * Single source of truth: per-practice runtime state lives on
 * PracticeConfiguration. This package only adds typed shapes for the three
 * new sections so the upstream loader, the policy-gateway, and the
 * notification-router can all parse the same content.
 */

import { z } from "zod";

/* ───────────── agents[] ───────────── */

export const AUTONOMY_TIERS = [0, 1, 2, 3, 4, 5] as const;
export type AutonomyTier = (typeof AUTONOMY_TIERS)[number];

export const PURPOSE_OF_USE = [
  "treatment",
  "payment",
  "operations",
  "research",
  "public-health",
  "disclosure",
  "emergency",
  "patient-request",
] as const;

export const RISK_LEVELS = ["low", "moderate", "high"] as const;

/**
 * Data classes the policy-gateway recognizes. The upstream EMR enforces these
 * verbatim when filtering agent retrieval down to minimum necessary.
 */
export const ALLOWED_DATA_CLASSES = [
  "demographics",
  "encounters",
  "conditions",
  "observations",
  "medications",
  "labs",
  "imaging",
  "documents",
  "care-plans",
  "appointments",
  "coverage",
  "consent",
  "audit",
  "sensitive-behavioral-health",
  "sensitive-sud",
  "sensitive-reproductive",
] as const;

const AgentEscalationSchema = z
  .object({
    on_risk_above: z.enum(RISK_LEVELS),
    route_to: z.string().min(1),
  })
  .strict();

export const AgentDescriptorSchema = z
  .object({
    id: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "agent id must be snake_case"),
    autonomy_tier: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
    /** Modality dependency. `null` = always enabled. */
    modality: z.string().nullable().optional(),
    allowed_data_classes: z.array(z.enum(ALLOWED_DATA_CLASSES)).min(1),
    allowed_tools: z.array(z.string().min(1)).min(1),
    purpose_of_use: z.enum(PURPOSE_OF_USE),
    requires_human_review: z.boolean(),
    escalation: AgentEscalationSchema.optional(),
  })
  .strict();

export type AgentDescriptor = z.infer<typeof AgentDescriptorSchema>;

/* ───────────── clinical_routing_rules[] ───────────── */

const PredicateSchema = z
  .object({
    value_greater_than: z.number().optional(),
    value_less_than: z.number().optional(),
    value_equal_to: z.union([z.string(), z.number(), z.boolean()]).optional(),
    value_in: z.array(z.string()).optional(),
    code_in: z.array(z.string()).optional(),
    status_equal_to: z.string().optional(),
  })
  .strict()
  .refine(
    (p) => Object.values(p).some((v) => v !== undefined),
    "predicate must specify at least one constraint",
  );

const ROUTING_PRIORITIES = ["routine", "high", "urgent", "stat"] as const;

export const ClinicalRoutingRuleSchema = z
  .object({
    name: z.string().regex(/^[a-z][a-z0-9_]{1,63}$/, "rule name must be snake_case"),
    when: z
      .object({
        resource: z.string().min(1),
        code: z.string().min(1),
        predicate: PredicateSchema,
      })
      .strict(),
    then: z
      .object({
        route_to: z.string().min(1),
        priority: z.enum(ROUTING_PRIORITIES),
        trigger_agent: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export type ClinicalRoutingRule = z.infer<typeof ClinicalRoutingRuleSchema>;

/* ───────────── writeback_policy ───────────── */

export const WritebackPolicySchema = z
  .object({
    allowed_resources: z.array(z.string().min(1)).min(1),
    requires_approval: z.boolean(),
    max_autonomy_tier: z.union([
      z.literal(0),
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]),
  })
  .strict();

export type WritebackPolicy = z.infer<typeof WritebackPolicySchema>;

/* ───────────── manifest extensions ───────────── */

/**
 * Optional LeafBridge sections that live on the upstream SpecialtyManifest.
 * All three are optional — existing manifests that don't set them validate
 * unchanged.
 */
export const LeafBridgeManifestExtensionsSchema = z
  .object({
    agents: z.array(AgentDescriptorSchema).optional(),
    clinical_routing_rules: z.array(ClinicalRoutingRuleSchema).optional(),
    writeback_policy: WritebackPolicySchema.optional(),
  })
  .partial();

export type LeafBridgeManifestExtensions = z.infer<
  typeof LeafBridgeManifestExtensionsSchema
>;

/* ───────────── practice-config extensions ───────────── */

const AGENT_OVERRIDE_VALUES = ["enabled", "disabled"] as const;

export const LeafBridgePracticeConfigExtensionsSchema = z
  .object({
    agent_enable_overrides: z
      .record(z.enum(AGENT_OVERRIDE_VALUES))
      .optional(),
    clinical_routing_rules: z.array(ClinicalRoutingRuleSchema).optional(),
    writeback_policy: WritebackPolicySchema.optional(),
  })
  .partial();

export type LeafBridgePracticeConfigExtensions = z.infer<
  typeof LeafBridgePracticeConfigExtensionsSchema
>;

/* ───────────── filter helper ───────────── */

/**
 * Apply the merge rule: practice override > template default. Returns the
 * effective agent set for a practice, with modality-gated agents dropped
 * when the modality is disabled.
 *
 * The upstream EMR's `isModalityEnabled(practiceId, modality)` is the
 * authoritative gate. Callers pass the resolved boolean set in
 * `enabledModalities` to keep this function pure.
 */
export function resolveEffectiveAgents(input: {
  templateAgents: readonly AgentDescriptor[];
  enabledModalities: ReadonlySet<string>;
  practiceOverrides?: Record<string, "enabled" | "disabled"> | undefined;
}): AgentDescriptor[] {
  const overrides = input.practiceOverrides ?? {};
  return input.templateAgents.filter((agent) => {
    const override = overrides[agent.id];
    if (override === "disabled") return false;
    if (override === "enabled") {
      // explicit enable still respects modality gate
      if (agent.modality && !input.enabledModalities.has(agent.modality)) return false;
      return true;
    }
    // no override — default to enabled, gated by modality
    if (agent.modality && !input.enabledModalities.has(agent.modality)) return false;
    return true;
  });
}
