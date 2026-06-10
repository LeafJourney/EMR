// Shared types for per-state cannabis registry integrations.
//
// Each state has its own portal/API. We model a uniform request and result
// shape so the EMR can submit to any state via a single dispatch function.

import { z } from "zod";

export const providerCredentialsSchema = z.object({
  registryId: z.string().optional(),
  npi: z.string().optional(),
  licenseNumber: z.string().optional(),
});

export type ProviderCredentials = z.infer<typeof providerCredentialsSchema>;

export const registrySubmissionSchema = z.object({
  stateCode: z.string().length(2),
  formData: z.record(z.union([z.string(), z.boolean(), z.number()])),
  providerCredentials: providerCredentialsSchema,
});

export type RegistrySubmission = z.infer<typeof registrySubmissionSchema>;

/**
 * How the submission was (or wasn't) transmitted.
 *
 * - "api"         — a real registry API call was attempted. Confirmation
 *                   numbers come from the registry, never fabricated.
 * - "manual_stub" — no registry API is connected for this state (either the
 *                   state is paper-based or credentials are not configured).
 *                   NOTHING was transmitted. Callers must surface this as
 *                   "manual filing required" — never as an electronic
 *                   submission success, and never with a confirmation number.
 */
export type RegistrySubmissionMode = "api" | "manual_stub";

export interface RegistrySubmissionResult {
  success: boolean;
  mode: RegistrySubmissionMode;
  confirmationNumber?: string;
  registryPatientId?: string;
  expirationDate?: string;
  errors?: string[];
  submittedAt: string;
}

export type StateRegistrySubmitter = (
  submission: RegistrySubmission,
) => Promise<RegistrySubmissionResult>;
