// Ohio — Cannabis Therapeutic Recommendation (CTR) system
// https://www.medicalmarijuana.ohio.gov/
//
// Physicians must hold a CTR certificate from the Ohio State Medical Board.
// When API credentials are not configured, nothing is transmitted — the
// result is an honest manual_stub marker (no fabricated confirmation
// numbers).

import {
  buildManualStubResult,
  postToRegistry,
  resolveRegistryEndpoint,
} from "./client";
import type { RegistrySubmission, RegistrySubmissionResult } from "./types";

export async function submitOH(
  submission: RegistrySubmission,
): Promise<RegistrySubmissionResult> {
  const endpoint = resolveRegistryEndpoint("OH");
  if (!endpoint) return buildManualStubResult();
  return postToRegistry(endpoint, "/ctr/recommendations", submission);
}
