// EMR-784: Patient verbal consent disclaimer for voice/ambient AI scribe.
//
// Every clinical note, summary, draft, or patient-facing message produced by
// voice/ambient AI scribe flows must carry this standardized disclaimer so it
// is visible to clinicians, patients, and downstream record reviewers.

export const AI_CONSENT_DISCLAIMER =
  "AI was used to document and scribe the patient encounter. Patient was informed and gave verbal consent agreeing on its use.";

export const AI_CONSENT_DISCLAIMER_HEADING = "AI Documentation Consent";

/**
 * Returns true if the given text already contains the disclaimer (exact or
 * substring match on the canonical sentence). Used to keep finalize/save logic
 * idempotent — we don't want to append the disclaimer twice when the clinician
 * edits and re-saves an AI-drafted note.
 */
export function hasConsentDisclaimer(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.includes(AI_CONSENT_DISCLAIMER);
}

/**
 * Append the disclaimer to a free-text body, separated by a blank line. If the
 * disclaimer is already present, the input is returned unchanged.
 */
export function appendConsentDisclaimer(body: string): string {
  if (hasConsentDisclaimer(body)) return body;
  const trimmed = body.trimEnd();
  if (trimmed.length === 0) return AI_CONSENT_DISCLAIMER;
  return `${trimmed}\n\n${AI_CONSENT_DISCLAIMER}`;
}

/**
 * Prepend the disclaimer to a free-text body, separated by a blank line. Used
 * for log-style fields (e.g. Code Blue flow sheet) where the disclaimer should
 * head the document. Idempotent on repeated calls.
 */
export function prependConsentDisclaimer(body: string): string {
  if (hasConsentDisclaimer(body)) return body;
  const trimmed = body.trimStart();
  if (trimmed.length === 0) return AI_CONSENT_DISCLAIMER;
  return `${AI_CONSENT_DISCLAIMER}\n\n${trimmed}`;
}

/**
 * Build a note block carrying the disclaimer. The Note schema's block `type`
 * union does not include a dedicated disclaimer type, so we ride on the
 * "summary" type with a distinctive heading. Editors render unknown headings
 * verbatim, and finalize-time checks key off the heading string.
 */
export function buildConsentDisclaimerBlock(): {
  type: "summary";
  heading: typeof AI_CONSENT_DISCLAIMER_HEADING;
  body: string;
} {
  return {
    type: "summary",
    heading: AI_CONSENT_DISCLAIMER_HEADING,
    body: AI_CONSENT_DISCLAIMER,
  };
}

/**
 * Ensure a note's blocks array carries the consent disclaimer block. Returns
 * a new array with the disclaimer prepended when missing, or the input array
 * untouched when already present. Operates on the loose `{heading, body}`
 * shape used everywhere notes are persisted so it can be reused across the
 * voice-chart action, scribe agent, and finalize paths.
 */
export function ensureConsentDisclaimerBlock<
  T extends { heading?: string; body?: string },
>(blocks: T[]): T[] {
  const already = blocks.some(
    (b) =>
      b?.heading === AI_CONSENT_DISCLAIMER_HEADING ||
      hasConsentDisclaimer(b?.body),
  );
  if (already) return blocks;
  return [buildConsentDisclaimerBlock() as unknown as T, ...blocks];
}
