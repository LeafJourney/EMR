// Illinois — IDPH Medical Cannabis Patient Program
// https://dph.illinois.gov/topics-services/prevention-wellness/medical-cannabis.html
//
// Physician certifications are submitted through the IDPH portal. When API
// credentials are not configured, nothing is transmitted — the result is an
// honest manual_stub marker (no fabricated confirmation numbers).

import {
  buildManualStubResult,
  postToRegistry,
  resolveRegistryEndpoint,
} from "./client";
import type { RegistrySubmission, RegistrySubmissionResult } from "./types";

export async function submitIL(
  submission: RegistrySubmission,
): Promise<RegistrySubmissionResult> {
  const endpoint = resolveRegistryEndpoint("IL");
  if (!endpoint) return buildManualStubResult();
  return postToRegistry(endpoint, "/mcpp/certifications", submission);
}
