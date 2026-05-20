import { z } from "zod";

export const ingestionSourceKindSchema = z.enum([
  "fhir-bundle",
  "hl7v2-message",
  "lab-report",
  "dispensary-pos",
  "wearable-metric",
]);

export const ingestionRequestSchema = z.object({
  source: ingestionSourceKindSchema,
  organizationId: z.string().min(1, "organizationId is required"),
  contentType: z.string().min(1),
  idempotencyKey: z.string().min(1).nullable().optional(),
  payload: z.unknown(),
});

export type IngestionRequest = z.infer<typeof ingestionRequestSchema>;
