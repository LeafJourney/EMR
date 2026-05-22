import { z } from "zod";

export const REGISTERED_MODALITIES = [
  "medications",
  "pain-medications",
  "labs",
  "imaging",
  "referrals",
  "procedures",
  "lifestyle",
  "physical-therapy",
  "functional-pain",
  "patient-reported-outcomes",
  "cannabis-medicine",
  "commerce-leafmart",
  "psilocybin",
  "integration-therapy",
  "veterinary-medicine",
  "human-pharmacology",
] as const;

export type RegisteredModality = (typeof REGISTERED_MODALITIES)[number];

export const REGISTERED_CARE_MODELS = [
  "longitudinal-primary-care",
  "longitudinal-interventional",
  "certification-longitudinal",
  "consultative",
  "procedural-only",
  "psychedelic-assisted",
  "animal-health",
] as const;

export type RegisteredCareModel = (typeof REGISTERED_CARE_MODELS)[number];

const KEBAB_CASE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const SNAKE_CASE = /^[a-z][a-z0-9_]{1,63}$/;

const modalityListSchema = z.array(z.string()).default([]);

/* ─────────────────── LeafBridge extensions (EMR-778) ──────────────────────
 *
 * Optional sections that extend the upstream Specialty Template with the
 * three LeafBridge-specific concepts: agents, clinical_routing_rules, and
 * writeback_policy. Default-null on existing manifests so the addition is
 * non-breaking — every v1 production manifest validates unchanged.
 *
 * Shapes mirror @leafbridge/specialty-dsl. When the LeafBridge open-source
 * package is published to npm we will import the shapes from there and
 * keep this file as a thin re-export.
 */

const AGENT_AUTONOMY_TIER = z.union([
  z.literal(0),
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

const AGENT_PURPOSE_OF_USE = z.enum([
  "treatment",
  "payment",
  "operations",
  "research",
  "public-health",
  "disclosure",
  "emergency",
  "patient-request",
]);

const AGENT_RISK_LEVEL = z.enum(["low", "moderate", "high"]);

const ALLOWED_DATA_CLASSES = z.enum([
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
]);

const ROUTING_PRIORITY = z.enum(["routine", "high", "urgent", "stat"]);

const AgentEscalationSchema = z
  .object({
    on_risk_above: AGENT_RISK_LEVEL,
    route_to: z.string().min(1),
  })
  .strict();

export const AgentDescriptorSchema = z
  .object({
    id: z.string().regex(SNAKE_CASE, "agent id must be snake_case"),
    autonomy_tier: AGENT_AUTONOMY_TIER,
    /** Modality dependency. `null` (or undefined) = always enabled. */
    modality: z.string().nullable().optional(),
    allowed_data_classes: z.array(ALLOWED_DATA_CLASSES).min(1),
    allowed_tools: z.array(z.string().min(1)).min(1),
    purpose_of_use: AGENT_PURPOSE_OF_USE,
    requires_human_review: z.boolean(),
    escalation: AgentEscalationSchema.optional(),
  })
  .strict();

export type AgentDescriptor = z.infer<typeof AgentDescriptorSchema>;

const RoutingPredicateSchema = z
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

export const ClinicalRoutingRuleSchema = z
  .object({
    name: z.string().regex(SNAKE_CASE, "rule name must be snake_case"),
    when: z
      .object({
        resource: z.string().min(1),
        code: z.string().min(1),
        predicate: RoutingPredicateSchema,
      })
      .strict(),
    then: z
      .object({
        route_to: z.string().min(1),
        priority: ROUTING_PRIORITY,
        trigger_agent: z.string().optional(),
      })
      .strict(),
  })
  .strict();

export type ClinicalRoutingRule = z.infer<typeof ClinicalRoutingRuleSchema>;

export const WritebackPolicySchema = z
  .object({
    allowed_resources: z.array(z.string().min(1)).min(1),
    requires_approval: z.boolean(),
    max_autonomy_tier: AGENT_AUTONOMY_TIER,
  })
  .strict();

export type WritebackPolicy = z.infer<typeof WritebackPolicySchema>;

export const SpecialtyManifestSchema = z
  .object({
    name: z.string().min(2).max(80),
    slug: z.string().regex(KEBAB_CASE, "slug must be kebab-case"),
    description: z.string(),
    icon: z.string().min(1),
    version: z.string().regex(SEMVER, "version must be semver"),
    /**
     * EMR-431 — Deprecation flag.
     *
     * When `true`, the manifest is excluded from `listActiveSpecialtyTemplates()`
     * and may NOT be used to seed a NEW PracticeConfiguration via
     * `applyTemplateDefaults` (the registry throws "DEPRECATED_TEMPLATE").
     *
     * Existing configurations that recorded `(slug, version)` against this
     * manifest continue to render — `getSpecialtyTemplate(slug, version)`
     * still returns the deprecated manifest by exact-version lookup so we
     * preserve immutability of published references.
     */
    deprecated: z.boolean().optional(),
    default_care_model: z.enum(REGISTERED_CARE_MODELS),
    default_workflows: z.array(z.string()).default([]),
    default_modules: z.array(z.string()).default([]),
    default_charting_templates: z.array(z.string()).default([]),
    default_mission_control_cards: z.array(z.string()).default([]),
    default_patient_portal_cards: z.array(z.string()).default([]),
    default_enabled_modalities: modalityListSchema,
    default_disabled_modalities: modalityListSchema,
    migration_mapping_defaults: z.record(z.unknown()).default({}),
    /* LeafBridge extensions (EMR-778). All optional, default-null on existing rows. */
    agents: z.array(AgentDescriptorSchema).optional(),
    clinical_routing_rules: z.array(ClinicalRoutingRuleSchema).optional(),
    writeback_policy: WritebackPolicySchema.optional(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const registered = new Set<string>(REGISTERED_MODALITIES);

    const checkSubset = (
      list: string[],
      field: "default_enabled_modalities" | "default_disabled_modalities",
    ) => {
      for (const m of list) {
        if (!registered.has(m)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `unknown modality "${m}" — must be one of REGISTERED_MODALITIES`,
          });
        }
      }
    };

    checkSubset(manifest.default_enabled_modalities, "default_enabled_modalities");
    checkSubset(manifest.default_disabled_modalities, "default_disabled_modalities");

    const enabled = new Set(manifest.default_enabled_modalities);
    for (const m of manifest.default_disabled_modalities) {
      if (enabled.has(m)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["default_disabled_modalities"],
          message: `modality "${m}" cannot be in both default_enabled_modalities and default_disabled_modalities`,
        });
      }
    }
  });

export type SpecialtyManifest = z.infer<typeof SpecialtyManifestSchema>;

export type ValidateManifestResult =
  | { ok: true; manifest: SpecialtyManifest }
  | { ok: false; errors: string[] };

export function validateManifest(raw: unknown): ValidateManifestResult {
  const result = SpecialtyManifestSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, manifest: result.data };
  }
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });
  return { ok: false, errors };
}
