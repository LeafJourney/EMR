import { z } from "zod";

import {
  ClinicalRoutingRuleSchema,
  WritebackPolicySchema,
} from "@/lib/specialty-templates/manifest-schema";

/**
 * EMR-778 — LeafBridge per-practice overrides on top of the upstream
 * PracticeConfiguration. All three are optional; absence means "fall back
 * to the Specialty Template default". No breaking migration.
 */
const AGENT_ENABLE_OVERRIDE = z.enum(["enabled", "disabled"]);

export const agentEnableOverridesSchema = z.record(AGENT_ENABLE_OVERRIDE);

export const practiceConfigSchema = z.object({
  organizationId: z.string().min(1),
  practiceId: z.string().min(1),
  selectedSpecialty: z.string().min(1),
  workflowTemplateIds: z.array(z.string()).min(1),
  chartingTemplateIds: z.array(z.string()).min(1),
  rolePermissionTemplateIds: z.array(z.string()).min(1),
  patientShellTemplateId: z.string().min(1),
  physicianShellTemplateId: z.string().min(1),
  npi: z.string().regex(/^\d{10}$/, "NPI must be 10 digits").optional(),
  /* LeafBridge per-practice overrides — all optional, default-null. */
  agentEnableOverrides: agentEnableOverridesSchema.optional(),
  clinicalRoutingRules: z.array(ClinicalRoutingRuleSchema).optional(),
  writebackPolicy: WritebackPolicySchema.optional(),
});

export const draftPracticeConfigSchema = practiceConfigSchema.partial();
