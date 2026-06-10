// Colorado — CDPHE Medical Marijuana Registry
// https://cdphe.colorado.gov/medical-marijuana-registry
//
// Colorado does not require physician registration, and certifications are
// paper-based: the patient applies to CDPHE with the physician certification.
// Nothing is transmitted electronically — the result is an honest manual_stub
// marker.

import { buildManualStubResult } from "./client";
import type { RegistrySubmission, RegistrySubmissionResult } from "./types";

export async function submitCO(
  _submission: RegistrySubmission,
): Promise<RegistrySubmissionResult> {
  return buildManualStubResult();
}
