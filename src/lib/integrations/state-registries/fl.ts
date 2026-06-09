// Florida — Medical Marijuana Use Registry (MMUR)
// https://mmuregistry.flhealth.gov/
//
// Production wiring requires onboarding as a qualified physician with FDOH
// OMMU and obtaining MMUR API credentials. Until those env vars are set,
// nothing is transmitted — the result is an honest manual_stub marker (no
// fabricated confirmation numbers).

import {
  buildManualStubResult,
  postToRegistry,
  resolveRegistryEndpoint,
} from "./client";
import type { RegistrySubmission, RegistrySubmissionResult } from "./types";

export async function submitFL(
  submission: RegistrySubmission,
): Promise<RegistrySubmissionResult> {
  const endpoint = resolveRegistryEndpoint("FL");
  if (!endpoint) return buildManualStubResult();
  return postToRegistry(endpoint, "/v1/certifications", submission);
}
