// Michigan — Medical Marihuana Program (LARA / CRA)
// https://www.michigan.gov/mra/medical
//
// Michigan certifications are paper-based: the patient submits the physician
// certification along with their application to LARA. There is no electronic
// submission API, so nothing is transmitted — the result is an honest
// manual_stub marker.

import { buildManualStubResult } from "./client";
import type { RegistrySubmission, RegistrySubmissionResult } from "./types";

export async function submitMI(
  _submission: RegistrySubmission,
): Promise<RegistrySubmissionResult> {
  return buildManualStubResult();
}
