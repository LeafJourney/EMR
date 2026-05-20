import { z } from "zod";

export const fhirResourceSchema: z.ZodType<{
  resourceType: string;
  id?: string;
  meta?: Record<string, unknown>;
  [key: string]: unknown;
}> = z
  .object({
    resourceType: z.string().min(1),
    id: z.string().min(1).optional(),
    meta: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const fhirBundleSchema = z
  .object({
    resourceType: z.literal("Bundle"),
    type: z.string().optional(),
    entry: z
      .array(
        z
          .object({
            resource: fhirResourceSchema.optional(),
            fullUrl: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();
