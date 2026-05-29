/**
 * Dictation → SOAP routing.
 *
 * Pure helpers that map a dictated, section-split transcript onto the note
 * editor's blocks. The browser speech wiring (useDictation) and the
 * section-cue parser (splitIntoApsoSections) already exist; this module is
 * the deterministic glue between them and the editor's NoteBlock shape, kept
 * pure so it's unit-testable.
 *
 * Section mapping (SOAP ⇄ NoteBlockType):
 *   Subjective → "summary"     Objective  → "findings"
 *   Assessment → "assessment"  Plan       → "plan"
 *
 * Objective is gated: physicians often have staff document vitals, so the
 * Objective bucket only routes into the note when the physician has opted in
 * (the "reading the vitals out loud" case). Otherwise it's returned as
 * `skippedObjective` so the UI can tell them it was heard but not filed.
 */

import type { SectionedTranscript } from "./voice-dictation";
import { APSO_ORDER, NOTE_BLOCK_LABELS, type NoteBlockType } from "@/lib/domain/notes";

/** localStorage key (matches the app's `emr.prefs.v1.*` preference namespace). */
export const OBJECTIVE_DICTATION_PREF_KEY = "emr.prefs.v1.dictate.objective";

export interface SoapRoutableBlock {
  type?: NoteBlockType;
  heading: string;
  body: string;
}

export interface DictationRouting {
  /** Dictated text keyed by note block type (only sections that had speech). */
  byType: Partial<Record<NoteBlockType, string>>;
  /** Objective speech heard but not filed (when includeObjective is false). */
  skippedObjective: string;
}

function clean(s: string): string {
  return (s ?? "").trim();
}

/**
 * Map a `SectionedTranscript` (from `splitIntoApsoSections`) onto note block
 * types. Pre-cue "unfiled" speech and Subjective both land in the Subjective
 * ("summary") block. Objective routes to "findings" only when
 * `includeObjective` is true; otherwise it's returned as `skippedObjective`.
 */
export function routeDictationToBlocks(
  sectioned: SectionedTranscript,
  opts: { includeObjective: boolean },
): DictationRouting {
  const byType: Partial<Record<NoteBlockType, string>> = {};

  // Anything spoken before a section cue is almost always the patient's
  // narrative — fold it into Subjective ahead of the cued subjective text.
  const subjective = [clean(sectioned.unfiled), clean(sectioned.subjective)]
    .filter(Boolean)
    .join(" ")
    .trim();
  if (subjective) byType.summary = subjective;

  const assessment = clean(sectioned.assessment);
  if (assessment) byType.assessment = assessment;

  const plan = clean(sectioned.plan);
  if (plan) byType.plan = plan;

  const objective = clean(sectioned.objective);
  let skippedObjective = "";
  if (objective) {
    if (opts.includeObjective) byType.findings = objective;
    else skippedObjective = objective;
  }

  return { byType, skippedObjective };
}

/**
 * Combine a block's pre-dictation base body with the freshly dictated section
 * text. Dictation is *additive*: it appends below whatever the AI seeded or
 * the clinician already wrote, separated by a blank line. Idempotent across
 * streaming updates because callers pass the full section text each time and
 * always against the same captured base.
 */
export function mergeDictatedBody(base: string, dictated: string): string {
  const b = clean(base);
  const d = clean(dictated);
  if (!d) return base ?? "";
  if (!b) return d;
  return `${b}\n\n${d}`;
}

/** The note block types dictation may write into, given the Objective opt-in. */
export function soapTargetTypes(includeObjective: boolean): NoteBlockType[] {
  return includeObjective
    ? ["summary", "findings", "assessment", "plan"]
    : ["summary", "assessment", "plan"];
}

function apsoIndex(type?: NoteBlockType): number {
  const i = type ? APSO_ORDER.indexOf(type) : -1;
  return i === -1 ? APSO_ORDER.length : i;
}

/**
 * Ensure the block list has a slot for every SOAP target type before
 * dictation starts, appending empty APSO-labelled blocks for any that are
 * missing (e.g. a template-applied note without a Subjective block). Returns
 * the list APSO-sorted so the cards don't reorder mid-dictation.
 */
export function ensureSoapBlocks<T extends SoapRoutableBlock>(
  blocks: T[],
  includeObjective: boolean,
): (T | SoapRoutableBlock)[] {
  const present = new Set<NoteBlockType>(
    blocks
      .map((b) => b.type)
      .filter((t): t is NoteBlockType => Boolean(t)),
  );
  const additions: SoapRoutableBlock[] = [];
  for (const type of soapTargetTypes(includeObjective)) {
    if (!present.has(type)) {
      additions.push({ type, heading: NOTE_BLOCK_LABELS[type], body: "" });
    }
  }
  const combined: (T | SoapRoutableBlock)[] = [...blocks, ...additions];
  return combined.sort((a, b) => apsoIndex(a.type) - apsoIndex(b.type));
}
