// ───────────────────────────────────────────────────────────────────────────
// EMR-1151 — Readability layer
// ───────────────────────────────────────────────────────────────────────────
// Doc Phase 3: compute the Linguistic Accessibility Target Index (word length +
// sentence structure + medical-density weights) and drive generated copy toward
// a 6th–8th grade profile.
//
// The Flesch–Kincaid grade math mirrors `approximateGradeLevel` in
// src/lib/education/medication-explainer.ts (same coefficients) so the AVS and
// the medication explainer report consistent grades; it's re-implemented here
// to keep the AVS domain module free of the med-catalog import.

import type { ReadabilityScore } from "./types";

export const DEFAULT_TARGET_GRADE_MIN = 6;
export const DEFAULT_TARGET_GRADE_MAX = 8;

/** Approximate syllable count for a single word. */
export function countSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const matches = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "")
    .replace(/^y/, "")
    .match(/[aeiouy]{1,2}/g);
  return matches ? matches.length : 1;
}

function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function sentenceCount(text: string): number {
  return (text.match(/[.!?]+/g) || []).length || 1;
}

/** Flesch–Kincaid grade approximation (matches the med-explainer formula). */
export function fleschKincaidGrade(text: string): number {
  const sentences = sentenceCount(text);
  const ws = words(text);
  const wordCount = ws.length || 1;
  const syllables = ws.reduce((sum, w) => sum + countSyllables(w), 0);
  return Math.max(
    0,
    0.39 * (wordCount / sentences) + 11.8 * (syllables / wordCount) - 15.59,
  );
}

/**
 * Density of "hard" words — 3+ syllables and not a common safe long word.
 * Stands in for clinical/medical complexity without a full term list.
 */
export function medicalDensity(text: string): number {
  const ws = words(text).map((w) => w.replace(/[^a-z]/gi, "")).filter(Boolean);
  if (ws.length === 0) return 0;
  const hard = ws.filter((w) => countSyllables(w) >= 3 && !COMMON_LONG_WORDS.has(w.toLowerCase()));
  return hard.length / ws.length;
}

// Long but everyday words that shouldn't count as "clinical complexity".
const COMMON_LONG_WORDS = new Set([
  "medicine", "medication", "important", "appointment", "remember",
  "exercise", "another", "everyday", "together", "tomorrow", "family",
  "energy", "morning", "evening", "feeling", "better", "water",
]);

export interface ReadabilityOptions {
  targetGradeMin?: number;
  targetGradeMax?: number;
}

/**
 * Compute the full readability profile + composite accessibility index.
 *
 * The index is a transparent weighted blend (higher = harder to read):
 *   index = 1.0·avgWordLength + 0.5·avgSentenceLength + 30·medicalDensity
 * so longer words, longer sentences, and denser clinical vocabulary each push
 * the score up. `meetsTarget` is driven by the FK grade band, not the index.
 */
export function computeReadability(
  text: string,
  opts: ReadabilityOptions = {},
): ReadabilityScore {
  const targetGradeMin = opts.targetGradeMin ?? DEFAULT_TARGET_GRADE_MIN;
  const targetGradeMax = opts.targetGradeMax ?? DEFAULT_TARGET_GRADE_MAX;

  const ws = words(text);
  const wordCount = ws.length || 1;
  const sentences = sentenceCount(text);
  const totalChars = ws.reduce((sum, w) => sum + w.replace(/[^a-z]/gi, "").length, 0);

  const avgWordLength = totalChars / wordCount;
  const avgSentenceLength = wordCount / sentences;
  const density = medicalDensity(text);
  const grade = round2(fleschKincaidGrade(text));
  const index = round2(1.0 * avgWordLength + 0.5 * avgSentenceLength + 30 * density);

  return {
    grade,
    avgWordLength: round2(avgWordLength),
    avgSentenceLength: round2(avgSentenceLength),
    medicalDensity: round2(density),
    index,
    targetGradeMin,
    targetGradeMax,
    // A summary below the band is fine (simpler than asked); only above-band
    // copy fails the target.
    meetsTarget: grade <= targetGradeMax,
  };
}

/** Plain-language swaps for the handful of complex words AVS copy tends to use. */
const SIMPLIFY_MAP: Array<[RegExp, string]> = [
  [/\butilize\b/gi, "use"],
  [/\badminister\b/gi, "take"],
  [/\bdiscontinue\b/gi, "stop"],
  [/\binitiate\b/gi, "start"],
  [/\bphysician\b/gi, "doctor"],
  [/\bhypertension\b/gi, "high blood pressure"],
  [/\bapproximately\b/gi, "about"],
  [/\bsubsequent(ly)?\b/gi, "next"],
  [/\bmonitor\b/gi, "keep an eye on"],
  [/\badditional\b/gi, "more"],
  [/\bprior to\b/gi, "before"],
];

const MAX_SENTENCE_WORDS = 18;

/**
 * Deterministic readability fallback the generator can apply: swap a few
 * complex words for plain ones and split over-long sentences at natural breaks.
 * Never touches numbers/units, so doses and timings survive untouched.
 */
export function simplifyForReadability(text: string): string {
  let out = text;
  for (const [pattern, replacement] of SIMPLIFY_MAP) out = out.replace(pattern, replacement);

  const sentences = out.split(/(?<=[.!?])\s+/);
  const rebuilt = sentences.map((sentence) => {
    if (words(sentence).length <= MAX_SENTENCE_WORDS) return sentence;
    // Split a long sentence at the first clause break past the midpoint.
    const parts = sentence.split(/,\s+(?:and|but|so|because|which|while)\s+/i);
    if (parts.length > 1) {
      return parts
        .map((p) => p.trim())
        .map((p) => (/[.!?]$/.test(p) ? p : `${p}.`))
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");
    }
    return sentence;
  });
  return rebuilt.join(" ").replace(/\s+/g, " ").trim();
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
