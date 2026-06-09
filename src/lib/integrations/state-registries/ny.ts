// New York — NY Office of Cannabis Management (OCM) Medical Cannabis Program
// https://cannabis.ny.gov/medical-cannabis
//
// Practitioners must be registered with NY OCM. When API credentials are not
// configured, nothing is transmitted — the result is an honest manual_stub
// marker (no fabricated confirmation numbers).

import {
  buildManualStubResult,
  postToRegistry,
  resolveRegistryEndpoint,
} from "./client";
import type { RegistrySubmission, RegistrySubmissionResult } from "./types";

export async function submitNY(
  submission: RegistrySubmission,
): Promise<RegistrySubmissionResult> {
  const endpoint = resolveRegistryEndpoint("NY");
  if (!endpoint) return buildManualStubResult();
  return postToRegistry(endpoint, "/practitioner/certifications", submission);
}
