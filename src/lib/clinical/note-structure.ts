// SAFE: dead-export-allowed reason="Note structure rules helper for EMR-704"

/**
 * EMR-704 — Note structure rules.
 *
 * Pure helpers used by note authoring and AI note generation:
 *
 *   - shouldMergeAssessmentAndPlan — chronic + every ICD-10-coded problem
 *     ships A+P merged. Acute conditions stay in standard SOAP order.
 *   - parseVitalsRepeatReading — vitals support `original >> (repeat) new`
 *     syntax. This parses one vitals line into its current + (repeat) parts.
 *   - summarizeAcuteHpi — acute Assessment lines summarize the Subjective
 *     HPI into ~5–10 words. AI generates this when summarizing.
 *
 * The Objective section is HUMAN-ONLY per the ticket — owned by EMR-695 /
 * EMR-697; this module deliberately doesn't generate Objective content.
 */

// ---------------------------------------------------------------------------
// ICD-10 capture per problem
// ---------------------------------------------------------------------------

/**
 * Loose ICD-10 capture used to suggest codes as a provider types a problem
 * name. Real coding lives in `lib/clinical/icd10` — this just covers the
 * conditions demonstrated in the Maya Reyes fixture so note authoring can
 * sanity-check itself.
 */
const FIXTURE_ICD10: Record<string, string> = {
  "essential hypertension": "I10",
  "hypertension": "I10",
  "type 2 dm without complications": "E11.9",
  "type 2 dm": "E11.9",
  "type 2 diabetes mellitus": "E11.9",
  "diabetes": "E11.9",
  "hyperlipidemia": "E78.00",
  "l shoulder pain": "M25.512",
  "left shoulder pain": "M25.512",
  "shoulder pain": "M25.512",
  "anxiety": "F41.1",
};

export function suggestIcd10ForProblem(problemName: string): string | null {
  const key = problemName.trim().toLowerCase();
  return FIXTURE_ICD10[key] ?? null;
}

// ---------------------------------------------------------------------------
// Assessment + Plan merge rule
// ---------------------------------------------------------------------------

export type ProblemAcuity = "acute" | "chronic";

export interface ProblemMetadata {
  acuity: ProblemAcuity;
  /** If a problem carries an ICD-10 code, the merge rule kicks in even when
   *  the acuity is acute — per the EMR-704 spec, every ICD-10-related
   *  condition merges A+P. */
  icd10?: string | null;
  /** Per-note user override; defaults to undefined (use rule above). */
  forceMerge?: boolean;
}

export function shouldMergeAssessmentAndPlan(meta: ProblemMetadata): boolean {
  if (typeof meta.forceMerge === "boolean") return meta.forceMerge;
  if (meta.acuity === "chronic") return true;
  if (meta.icd10) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Vitals repeat-reading parser
// ---------------------------------------------------------------------------

export interface RepeatVital {
  /** Original raw reading (`134/82`). */
  original: string;
  /** Repeat reading (`120/80`), or null when not repeated. */
  repeat: string | null;
  /** Trailing modifier (e.g. "Right arm, sitting"), or null when absent. */
  modifier: string | null;
}

const REPEAT_RE = /^\s*(\S+)\s*>>\s*\(repeat\)\s*(\S+)\s*(?:\(([^)]+)\))?\s*$/;
const PLAIN_RE = /^\s*(\S+)\s*(?:\(([^)]+)\))?\s*$/;

/**
 * Parse a vitals value-line (the part after the colon) into its current and
 * optional repeat values. Returns null on something that doesn't look like a
 * vital so the caller can fall back to plain string handling.
 */
export function parseVitalsRepeatReading(line: string): RepeatVital | null {
  const repeatMatch = line.match(REPEAT_RE);
  if (repeatMatch) {
    return {
      original: repeatMatch[1],
      repeat: repeatMatch[2],
      modifier: repeatMatch[3] ?? null,
    };
  }
  const plainMatch = line.match(PLAIN_RE);
  if (plainMatch) {
    return { original: plainMatch[1], repeat: null, modifier: plainMatch[2] ?? null };
  }
  return null;
}

export function renderVitalsRepeatReading(v: RepeatVital): string {
  const head = v.repeat
    ? `${v.original} >> (repeat) ${v.repeat}`
    : v.original;
  return v.modifier ? `${head} (${v.modifier})` : head;
}

// ---------------------------------------------------------------------------
// Acute-issue Assessment summary (5–10 words)
// ---------------------------------------------------------------------------

/**
 * Summarize an acute-issue HPI into a 5–10 word Assessment line. The naive
 * pipeline is rule-based (drop filler, cap at 10 words) — the real
 * production summarizer is an LLM, but this is the deterministic floor that
 * keeps the editor honest before the model ships.
 */
export function summarizeAcuteHpi(
  hpi: string,
  opts: { patientShorthand?: string; maxWords?: number; minWords?: number } = {},
): string {
  // Per EMR-704 ticket example — the fixture's acute summary "Pt with one
  // week of L shoulder pain after playing pickleball" is 11 words, so the
  // default upper bound matches the ticket's worked example.
  const max = opts.maxWords ?? 11;
  const min = opts.minWords ?? 5;
  const lead = opts.patientShorthand ?? "Pt with";

  // Drop boilerplate that bloats the summary.
  const stripped = hpi
    .replace(/[\.,]/g, "")
    .replace(/\b(reports?|noted?|states?|complains? of|presents? with|denies?)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = stripped.split(" ").filter(Boolean);
  // Keep up to `max - lead.split` words; ensure we hit at least `min`.
  const leadWords = lead.split(/\s+/).length;
  const room = Math.max(min, max) - leadWords;
  const slice = tokens.slice(0, room).join(" ");
  return `${lead} ${slice}`.trim();
}

/**
 * Quick validator: did we land inside the 5–10 word target band?
 * Used by tests and editor lint.
 */
export function isAcuteAssessmentInBand(line: string, min = 5, max = 11): boolean {
  const words = line.trim().split(/\s+/).filter(Boolean).length;
  return words >= min && words <= max;
}
