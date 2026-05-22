/**
 * @leafbridge/fhir-schemas
 *
 * Phase 0 — minimal Zod schemas for Tier A FHIR R4 resources. The full
 * US Core profile validation lands in Phase 1 alongside the
 * fhir-server-adapter. For now we export the canonical shape so the
 * specialty-dsl + agent-sdk can name resource types in type-safe routing
 * rules and write-back policies.
 */

import { z } from "zod";

export const TIER_A_RESOURCE_TYPES = [
  "Patient",
  "Practitioner",
  "Organization",
  "Encounter",
  "Condition",
  "Observation",
  "MedicationRequest",
  "DiagnosticReport",
  "DocumentReference",
  "Binary",
  "Consent",
  "Provenance",
  "AuditEvent",
] as const;

export type TierAResourceType = (typeof TIER_A_RESOURCE_TYPES)[number];

export const ResourceTypeSchema = z.enum(TIER_A_RESOURCE_TYPES);

/* ───────────── tiny shared shapes ───────────── */

const CodingSchema = z
  .object({
    system: z.string().url().optional(),
    code: z.string().min(1).optional(),
    display: z.string().optional(),
  })
  .strict();

const CodeableConceptSchema = z
  .object({
    coding: z.array(CodingSchema).optional(),
    text: z.string().optional(),
  })
  .strict();

const ReferenceSchema = z
  .object({
    reference: z.string().min(1),
    display: z.string().optional(),
  })
  .strict();

const MetaSchema = z
  .object({
    versionId: z.string().optional(),
    lastUpdated: z.string().datetime().optional(),
    profile: z.array(z.string().url()).optional(),
    tag: z.array(CodingSchema).optional(),
  })
  .strict()
  .partial();

const BaseResourceSchema = z
  .object({
    resourceType: ResourceTypeSchema,
    id: z.string().regex(/^[A-Za-z0-9-.]{1,64}$/).optional(),
    meta: MetaSchema.optional(),
  })
  .passthrough();

export const PatientStubSchema = BaseResourceSchema.extend({
  resourceType: z.literal("Patient"),
});

export const ObservationStubSchema = BaseResourceSchema.extend({
  resourceType: z.literal("Observation"),
  status: z.string().min(1),
  code: CodeableConceptSchema,
  subject: ReferenceSchema,
});

export const ConditionStubSchema = BaseResourceSchema.extend({
  resourceType: z.literal("Condition"),
  code: CodeableConceptSchema,
  subject: ReferenceSchema,
});

export type FhirResourceStub = z.infer<typeof BaseResourceSchema>;
