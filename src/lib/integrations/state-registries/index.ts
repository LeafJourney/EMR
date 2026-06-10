// State Registry integrations — dispatch by state code.
//
// Each state has its own portal/API (or paper process). This module exposes
// a single `submitToStateRegistry` entry point that validates the inbound
// payload with Zod and delegates to the per-state submitter.

import { submitCA } from "./ca";
import { submitCO } from "./co";
import { submitFL } from "./fl";
import { submitIL } from "./il";
import { submitMI } from "./mi";
import { submitNY } from "./ny";
import { submitOH } from "./oh";
import { submitPA } from "./pa";
import { registrySubmissionSchema } from "./types";
import type {
  RegistrySubmission,
  RegistrySubmissionResult,
  StateRegistrySubmitter,
} from "./types";

export type {
  ProviderCredentials,
  RegistrySubmission,
  RegistrySubmissionMode,
  RegistrySubmissionResult,
  StateRegistrySubmitter,
} from "./types";

const SUBMITTERS: Record<string, StateRegistrySubmitter> = {
  CA: submitCA,
  CO: submitCO,
  FL: submitFL,
  IL: submitIL,
  MI: submitMI,
  NY: submitNY,
  OH: submitOH,
  PA: submitPA,
};

export function getSupportedStateCodes(): string[] {
  return Object.keys(SUBMITTERS);
}

export async function submitToStateRegistry(
  submission: RegistrySubmission,
): Promise<RegistrySubmissionResult> {
  const parsed = registrySubmissionSchema.safeParse(submission);
  if (!parsed.success) {
    return {
      success: false,
      errors: parsed.error.issues.map(
        (i) => `${i.path.join(".") || "(root)"}: ${i.message}`,
      ),
      submittedAt: new Date().toISOString(),
      mode: "api",
    };
  }

  const code = parsed.data.stateCode.toUpperCase();
  const submitter = SUBMITTERS[code];
  if (!submitter) {
    return {
      success: false,
      errors: [`No registry integration registered for state: ${code}`],
      submittedAt: new Date().toISOString(),
      mode: "api",
    };
  }

  return submitter(parsed.data);
}
