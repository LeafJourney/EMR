// Pennsylvania — PA DOH Medical Marijuana Program
// https://padohmmp.custhelp.com/
//
// Practitioners must register with PA DOH and complete the 4-hour course.
// When API credentials are not configured, nothing is transmitted — the
// result is an honest manual_stub marker (no fabricated confirmation
// numbers).

import {
  buildManualStubResult,
  postToRegistry,
  resolveRegistryEndpoint,
} from "./client";
import type { RegistrySubmission, RegistrySubmissionResult } from "./types";

export async function submitPA(
  submission: RegistrySubmission,
): Promise<RegistrySubmissionResult> {
  const endpoint = resolveRegistryEndpoint("PA");
  if (!endpoint) return buildManualStubResult();
  return postToRegistry(endpoint, "/v1/certifications", submission);
}
