/**
 * @leafbridge/agent-sdk
 *
 * Shared agent types + helpers. Agent descriptors live on the Specialty
 * Template manifest (see @leafbridge/specialty-dsl). Output schema and
 * autonomy-tier helpers live here.
 */

import { z } from "zod";
import {
  AgentDescriptorSchema,
  resolveEffectiveAgents,
  type AgentDescriptor,
} from "@leafbridge/specialty-dsl";

export { AgentDescriptorSchema, resolveEffectiveAgents };
export type { AgentDescriptor };

export const SourceReferenceSchema = z
  .object({
    /** FHIR resource reference, e.g. "Observation/abc123". */
    reference: z.string().min(1),
    /** Optional human-readable display label. */
    display: z.string().optional(),
    /** Optional byte offsets into a DocumentReference. */
    range: z
      .object({
        start: z.number().int().nonnegative(),
        end: z.number().int().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();

export type SourceReference = z.infer<typeof SourceReferenceSchema>;

export const AgentOutputSchema = z
  .object({
    summary: z.string().min(1),
    recommendation: z.string().optional(),
    /**
     * Every output must cite at least one patient-specific source FHIR
     * resource. Backs the "no naked prompts" architectural invariant.
     */
    evidence: z.array(SourceReferenceSchema).min(1),
    confidence: z.number().min(0).max(1),
    risk_level: z.enum(["low", "moderate", "high"]),
    required_human_action: z.enum(["none", "review", "approve"]),
    write_back: z
      .object({
        resource: z.string().min(1),
        payload: z.unknown(),
      })
      .strict()
      .optional(),
    /**
     * Audit row is created BEFORE the agent's output is returned to the
     * caller. The audit_id is the foreign key into the audit-service.
     */
    audit_id: z.string().min(1),
  })
  .strict();

export type AgentOutput = z.infer<typeof AgentOutputSchema>;

/**
 * Returns true when the agent's autonomy tier is permitted under the
 * practice's writeback policy ceiling.
 */
export function isAutonomyWithinPolicy(
  agentTier: number,
  policyMaxTier: number,
): boolean {
  return agentTier <= policyMaxTier;
}
