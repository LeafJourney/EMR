// California — Medical Marijuana ID Card Program (MMICP)
// https://www.cdph.ca.gov/Programs/CHSI/Pages/MMICP-Landing.aspx
//
// California does not require physician registration. Prop 215 / SB 420
// recommendations are physician-issued; the optional MMIC is administered by
// county health departments, which do not expose a unified API. Nothing is
// transmitted electronically — the result is an honest manual_stub marker.

import { buildManualStubResult } from "./client";
import type { RegistrySubmission, RegistrySubmissionResult } from "./types";

export async function submitCA(
  _submission: RegistrySubmission,
): Promise<RegistrySubmissionResult> {
  return buildManualStubResult();
}
