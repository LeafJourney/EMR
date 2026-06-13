// UPI — deterministic clinical entity extraction (EMR-1146 / EMR-1147).
//
// Phase 1–2 of the "Asynchronous Triage & Smart Check-ins" red-text spec
// (docs/product-feedback/2026-06-12_workflows-revisions-red-text.md):
// text normalization + abbreviation expansion, symptom/condition lexicon
// mapped to ESI-style acuity classes, negation filtering ("no chest pain",
// "denies", "without fever") and subject attribution ("my daughter has…")
// so negated or third-party symptoms never escalate.
//
// Fixes EMR-1090 over-triage: the legacy keyword scan in
// src/lib/domain/smart-inbox.ts escalated on bare substring hits, so
// "no chest pain" and "my daughter had a rash" both paged the clinician.

export type AcuityClass = "red_flag" | "emergent" | "moderate" | "minor" | "admin";

export interface LexiconEntry {
  /** Stable identifier, also used for combo rules (e.g. fever + rash). */
  id: string;
  /** Human-readable label surfaced in the factor breakdown. */
  label: string;
  /** Matching pattern. Run against normalized (lowercased, expanded) text. */
  pattern: RegExp;
  /** ESI-style acuity coefficient in [0, 1]. */
  acuity: number;
  acuityClass: AcuityClass;
}

export interface ExtractedEntity {
  id: string;
  label: string;
  /** The literal (normalized) text that matched. */
  matched: string;
  /** Character offset in the normalized text — used for assertion analysis. */
  index: number;
  acuity: number;
  acuityClass: AcuityClass;
  /** True when a negation cue governs the mention ("no chest pain"). */
  negated: boolean;
  /** True when the symptom is attributed to someone other than the patient. */
  thirdParty: boolean;
}

export interface EntityExtractionResult {
  /** Every lexicon hit, including negated / third-party mentions. */
  entities: ExtractedEntity[];
  /** Non-negated, first-party clinical entities (admin excluded). */
  activeEntities: ExtractedEntity[];
  /**
   * Max acuity across active clinical entities, after combo rules.
   * Equals ADMIN_BASELINE_ACUITY when only admin/logistics (or nothing)
   * is present — per spec: "0.1 for minor administrative inquiries".
   */
  baseAcuity: number;
  /** The normalized text the extraction ran against (for transparency). */
  normalizedText: string;
}

/** A_esi floor for purely administrative / logistics messages. */
export const ADMIN_BASELINE_ACUITY = 0.1;

// ── Normalization ──────────────────────────────────────────────────────

/**
 * Shorthand → standardized clinical terms (spec Phase 1.2: e.g. converting
 * "soby" or "sob" to "shortness of breath"). Applied on word boundaries
 * against lowercased text. Deliberately conservative — only unambiguous
 * patient-message shorthand.
 */
const ABBREVIATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bsoby?\b/g, "shortness of breath"],
  [/\bdib\b/g, "difficulty breathing"],
  [/\bn\/v\b/g, "nausea and vomiting"],
  [/\bc\/o\b/g, "complains of"],
  [/\bappt\b/g, "appointment"],
  [/\brx\b/g, "prescription"],
  [/\bbp\b/g, "blood pressure"],
  [/\ber\b/g, "emergency room"],
  [/\babd\b/g, "abdominal"],
  // Apostrophe-less contractions matter for both lexicon + negation cues.
  [/\bcant\b/g, "can't"],
  [/\bwont\b/g, "won't"],
  [/\bdont\b/g, "don't"],
  [/\bim\b/g, "i'm"],
];

/** Lowercase, strip messaging artifacts, collapse whitespace, expand shorthand. */
export function normalizeMessageText(raw: string): string {
  let text = raw
    .toLowerCase()
    // Curly quotes → straight, so contraction matching is uniform.
    .replace(/[‘’]/g, "'")
    // Strip emoji / non-standard UI characters but KEEP clause punctuation,
    // which negation + subject-attribution windows rely on.
    .replace(/[^a-z0-9\s.,;:!?'\/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of ABBREVIATIONS) {
    text = text.replace(pattern, replacement);
  }
  return text;
}

// ── Lexicon ────────────────────────────────────────────────────────────
// Ordered most-specific-first; overlapping spans keep the first (longest)
// match, so "crushing chest pain" wins over the generic "chest pain" entry.

export const CLINICAL_LEXICON: ReadonlyArray<LexiconEntry> = [
  // ── ESI-1 red flags (acuity ≥ 0.9 — see RED_FLAG_ACUITY in upi.ts) ──
  {
    id: "crushing_chest_pain",
    label: "Crushing/radiating chest pain",
    pattern:
      /\b(?:crushing|squeezing|elephant on (?:my|the) chest)\b[^.!?]{0,40}\b(?:chest|pain|pressure)|\bchest (?:pain|pressure|tightness)[^.!?]{0,50}\bradiat/g,
    acuity: 1.0,
    acuityClass: "red_flag",
  },
  {
    id: "chest_pain",
    label: "Chest pain/pressure",
    pattern: /\bchest (?:pain|pains|pressure|tightness|hurts?)\b|\bmy chest (?:hurts|is tight)\b/g,
    acuity: 0.9,
    acuityClass: "red_flag",
  },
  {
    id: "breathing_emergency",
    label: "Severe breathing difficulty",
    pattern:
      /\bcan't (?:breathe|catch (?:my|a) breath)\b|\bstruggling to breathe\b|\bgasping for air\b/g,
    acuity: 1.0,
    acuityClass: "red_flag",
  },
  {
    id: "shortness_of_breath",
    label: "Shortness of breath",
    pattern: /\bshortness of breath\b|\bdifficulty breathing\b|\btrouble breathing\b/g,
    acuity: 0.9,
    acuityClass: "red_flag",
  },
  {
    id: "anaphylaxis",
    label: "Anaphylaxis / airway swelling",
    pattern:
      /\banaphyla\w*\b|\bthroat (?:is )?(?:closing|swelling|swollen)\b|\b(?:tongue|lips?) (?:are |is )?swelling\b/g,
    acuity: 1.0,
    acuityClass: "red_flag",
  },
  {
    id: "uncontrolled_bleeding",
    label: "Uncontrolled bleeding",
    pattern:
      /\b(?:uncontrolled|uncontrollable|severe) bleeding\b|\bbleeding (?:won't|will not|doesn't|does not) stop\b|\bcan't stop (?:the )?bleeding\b|\bbleeding out\b/g,
    acuity: 1.0,
    acuityClass: "red_flag",
  },
  {
    id: "suicidal_ideation",
    label: "Suicidal ideation / self-harm",
    pattern:
      /\bsuicid\w*\b|\bkill (?:myself|himself|herself|themselves)\b|\bend (?:my|his|her|their) life\b|\bwant(?:s)? to die\b|\bself[ -]harm\w*\b/g,
    acuity: 1.0,
    acuityClass: "red_flag",
  },
  {
    id: "stroke_signs",
    label: "Stroke signs (unilateral weakness / face droop / slurred speech)",
    pattern:
      /\b(?:face|arm|leg|side)[^.!?]{0,20}\bdroop\w*\b|\bdroop\w*\b[^.!?]{0,20}\b(?:face|mouth|eye)\b|\bslurr\w* (?:my )?(?:speech|words)\b|\bspeech (?:is )?slurred\b|\bweak(?:ness)? (?:in|on) (?:my |the )?(?:left|right|one) (?:side|arm|leg|face)\b|\b(?:left|right|one)[ -]sided weakness\b|\bcan't (?:move|feel|lift) (?:my |the )?(?:left|right|one) (?:side|arm|leg)\b|\bsudden(?:ly)? numb\w*\b/g,
    acuity: 1.0,
    acuityClass: "red_flag",
  },
  {
    id: "unresponsive",
    label: "Unconscious / unresponsive",
    pattern: /\bunconscious\b|\bunresponsive\b|\bwon't wake up\b|\bnot waking up\b/g,
    acuity: 1.0,
    acuityClass: "red_flag",
  },
  {
    id: "seizure",
    label: "Seizure / convulsion",
    pattern: /\bseizures?\b|\bseizing\b|\bconvuls\w*\b/g,
    acuity: 0.95,
    acuityClass: "red_flag",
  },
  {
    id: "overdose",
    label: "Overdose / poisoning",
    pattern: /\boverdos\w*\b|\bod'?d\b|\btook too (?:much|many)\b[^.!?]{0,30}\b(?:pill|med|dose)\w*\b/g,
    acuity: 0.95,
    acuityClass: "red_flag",
  },
  {
    id: "vomiting_blood",
    label: "Vomiting / coughing up blood",
    pattern:
      /\b(?:vomit\w*|throw\w* up|cough\w*(?: up)?) blood\b|\bblood in (?:my )?(?:vomit|stool|urine)\b/g,
    acuity: 0.95,
    acuityClass: "red_flag",
  },

  {
    id: "emergency_selfreport",
    label: "Explicit emergency self-report",
    pattern:
      /\b(?:this is|having|i'm having) an emergency\b|\bcall(?:ing|ed)? 911\b|\bneed (?:an )?ambulance\b|\b(?:going|heading|on my way) to the (?:emergency room|hospital)\b/g,
    acuity: 0.9,
    acuityClass: "red_flag",
  },

  // ── Emergent mid-tier (ESI-2-ish) ──
  {
    id: "syncope",
    label: "Fainting / syncope",
    pattern: /\bfaint(?:ed|ing)?\b|\bpassed out\b|\bblack(?:ed|ing) out\b|\bsyncope\b/g,
    acuity: 0.85,
    acuityClass: "emergent",
  },
  {
    id: "severe_pain",
    label: "Severe / worst-ever pain",
    pattern:
      /\b(?:severe|excruciating|unbearable|worst) (?:\w+ )?pain\b|\bpain (?:is )?(?:10|ten) out of (?:10|ten)\b|\b10\/10 pain\b/g,
    acuity: 0.7,
    acuityClass: "emergent",
  },
  {
    id: "confusion",
    label: "New confusion / disorientation",
    pattern: /\bconfus\w*\b|\bdisorient\w*\b|\bhallucinat\w*\b/g,
    acuity: 0.7,
    acuityClass: "emergent",
  },
  {
    id: "persistent_vomiting",
    label: "Persistent vomiting",
    pattern:
      /\b(?:persistent|constant|nonstop|non-stop) vomiting\b|\bcan't stop (?:vomiting|throwing up)\b|\bvomiting for \d+\b|\bkeep(?:s)? (?:vomiting|throwing up)\b/g,
    acuity: 0.6,
    acuityClass: "emergent",
  },
  {
    id: "palpitations",
    label: "Palpitations / racing heart",
    pattern: /\bpalpitation\w*\b|\bracing heart\b|\bheart (?:is )?(?:racing|pounding)\b|\brapid heart\s?(?:beat|rate)?\b/g,
    acuity: 0.6,
    acuityClass: "emergent",
  },
  {
    id: "high_fever",
    label: "High fever",
    pattern: /\bhigh fever\b|\bfever of (?:10[3-9]|1[1-9]\d)\b|\b10[3-9](?:\.\d)? ?(?:degrees|f)\b/g,
    acuity: 0.6,
    acuityClass: "emergent",
  },
  {
    id: "allergic_reaction",
    label: "Allergic reaction",
    pattern: /\ballergic reaction\b|\bsevere reaction\b|\bhives\b/g,
    acuity: 0.6,
    acuityClass: "emergent",
  },

  // ── Minor clinical (routine symptom reports) ──
  {
    id: "fever",
    label: "Fever",
    pattern: /\bfevers?\b|\bfeverish\b|\btemperature\b/g,
    acuity: 0.35,
    acuityClass: "minor",
  },
  {
    id: "rash",
    label: "Rash / skin reaction",
    pattern: /\brash(?:es)?\b|\bskin (?:reaction|irritation)\b/g,
    acuity: 0.3,
    acuityClass: "minor",
  },
  {
    id: "vomiting",
    label: "Vomiting",
    pattern: /\bvomit\w*\b|\bthrow\w* up\b/g,
    acuity: 0.4,
    acuityClass: "minor",
  },
  {
    id: "dizziness",
    label: "Dizziness",
    pattern: /\bdizz\w*\b|\blight-?headed\w*\b|\bvertigo\b/g,
    acuity: 0.35,
    acuityClass: "minor",
  },
  {
    id: "nausea",
    label: "Nausea",
    pattern: /\bnause\w*\b|\bqueasy\b/g,
    acuity: 0.3,
    acuityClass: "minor",
  },
  {
    id: "headache",
    label: "Headache",
    pattern: /\bheadaches?\b|\bmigraines?\b/g,
    acuity: 0.3,
    acuityClass: "minor",
  },
  {
    id: "swelling",
    label: "Swelling",
    pattern: /\bswelling\b|\bswollen\b/g,
    acuity: 0.35,
    acuityClass: "minor",
  },
  {
    id: "pain_generic",
    label: "Pain (unspecified)",
    pattern: /\bpains?\b|\bhurts?\b|\baching\b|\baches?\b/g,
    acuity: 0.3,
    acuityClass: "minor",
  },
  {
    id: "anxiety",
    label: "Anxiety / panic symptoms",
    pattern: /\banxiety\b|\banxious\b|\bpanic attacks?\b|\bparanoi\w*\b/g,
    acuity: 0.3,
    acuityClass: "minor",
  },

  // ── Admin / logistics (acuity floor 0.1) ──
  {
    id: "admin",
    label: "Administrative / scheduling / billing",
    pattern:
      /\bappointments?\b|\b(?:re)?schedul\w*\b|\brefills?\b|\brenewals?\b|\bprescriptions?\b|\bbilling\b|\binvoices?\b|\bstatements?\b|\binsurance\b|\bcopay\w*\b|\bpaperwork\b|\bforms?\b|\bportal\b|\bpassword\b|\breceipts?\b/g,
    acuity: ADMIN_BASELINE_ACUITY,
    acuityClass: "admin",
  },
];

// ── Assertion analysis: negation ───────────────────────────────────────

/** Cues that negate a following symptom mention within the same clause. */
const PRE_NEGATION_RE =
  /\b(?:no|not|without|denies?|denied|denying|never (?:had|have|get|gotten|experienced)|haven't (?:had|noticed|felt)|hasn't (?:had|been)|don't have|doesn't have|didn't have|isn't|wasn't|no longer|free of|ruled out|aside from|other than|except for)\s*$|\b(?:no|not|without|denies?|denied)\b/;

/** Resolution cues after a mention ("…but it's gone", "…has resolved"). */
const POST_RESOLUTION_RE =
  /\b(?:gone|resolved|cleared(?: up)?|went away|subsided|stopped|better now|all better|disappeared|healed|over now|no longer)\b/;

/**
 * "I've NEVER had chest pain like this" is an *active* emergency despite the
 * negation token — the comparison re-asserts the symptom. Spotting this
 * pattern was part of the EMR-1090 under-escalation review.
 */
const NEGATION_OVERRIDE_RE = /\blike this\b|\bthis bad\b|\buntil (?:now|today|tonight)\b/;

// ── Assertion analysis: subject attribution ────────────────────────────

const THIRD_PARTY_SUBJECT_RE =
  /\b(?:my|our)\s+(?:daughter|son|husband|wife|mom|mother|dad|father|brother|sister|grandm\w+|grandp\w+|grandfather|grandmother|aunt|uncle|cousin|niece|nephew|friend|neighbor|neighbour|roommate|partner|boyfriend|girlfriend|coworker|co-worker|colleague|child|kids?|baby|toddler|dog|cat|pet)\b|\b(?:he|she|they)\s+(?:has|have|had|is|was|were|got|gets|keeps?)\b|\bhis\s|\bher\s|\btheir\s/g;

/** First-person re-anchor — pulls attribution back to the patient.
 *  ("my" alone counts: "I told her about my pain" is first-party.) */
const FIRST_PERSON_RE = /\b(?:i|i'm|i've|i'll|me|my|myself|mine)\b/;

function sentenceBoundsAt(text: string, index: number): { start: number; end: number } {
  // Sentences split on . ! ? — commas intentionally stay inside the window
  // so "no chest pain, just a refill" keeps the negation in scope.
  let start = 0;
  for (let i = index - 1; i >= 0; i--) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?") {
      start = i + 1;
      break;
    }
  }
  let end = text.length;
  for (let i = index; i < text.length; i++) {
    const ch = text[i];
    if (ch === "." || ch === "!" || ch === "?") {
      end = i;
      break;
    }
  }
  return { start, end };
}

function lastWords(s: string, n: number): string {
  const words = s.trim().split(/\s+/);
  return words.slice(Math.max(0, words.length - n)).join(" ");
}

function firstWords(s: string, n: number): string {
  const words = s.trim().split(/\s+/);
  return words.slice(0, n).join(" ");
}

/** Negation check for a match spanning [index, index + length). */
export function isNegated(text: string, index: number, length: number): boolean {
  const { start, end } = sentenceBoundsAt(text, index);
  const preWindow = lastWords(text.slice(start, index), 6);
  const postWindow = firstWords(text.slice(index + length, end), 8);

  if (NEGATION_OVERRIDE_RE.test(postWindow)) return false;
  if (PRE_NEGATION_RE.test(preWindow)) return true;
  if (POST_RESOLUTION_RE.test(postWindow)) return true;
  return false;
}

/** Third-party attribution check for a match starting at `index`. */
export function isThirdParty(text: string, index: number): boolean {
  const { start } = sentenceBoundsAt(text, index);
  const sentenceBefore = text.slice(start, index);

  let lastSubjectEnd = -1;
  THIRD_PARTY_SUBJECT_RE.lastIndex = 0;
  for (const m of sentenceBefore.matchAll(THIRD_PARTY_SUBJECT_RE)) {
    lastSubjectEnd = (m.index ?? 0) + m[0].length;
  }
  if (lastSubjectEnd < 0) return false;

  // A first-person re-anchor BETWEEN the third-party subject and the
  // symptom pulls attribution back to the patient ("my husband said I
  // should message you — I have chest pain").
  const between = sentenceBefore.slice(lastSubjectEnd);
  return !FIRST_PERSON_RE.test(between);
}

// ── Combo rules (spec: "mid-tier like fever+rash") ─────────────────────

const COMBO_RULES: ReadonlyArray<{ ids: [string, string]; acuity: number; label: string }> = [
  { ids: ["fever", "rash"], acuity: 0.6, label: "Fever with rash" },
  { ids: ["fever", "headache"], acuity: 0.55, label: "Fever with headache" },
];

// ── Extraction ─────────────────────────────────────────────────────────

/**
 * Deterministic clinical entity extraction over a raw patient message.
 * No LLM, no network — pure function of the input text.
 */
export function extractEntities(rawText: string): EntityExtractionResult {
  const text = normalizeMessageText(rawText);
  const entities: ExtractedEntity[] = [];
  const claimed: Array<[number, number]> = []; // [start, end) spans already matched

  for (const entry of CLINICAL_LEXICON) {
    entry.pattern.lastIndex = 0;
    for (const m of text.matchAll(entry.pattern)) {
      const index = m.index ?? 0;
      const end = index + m[0].length;
      // Skip spans already claimed by a more specific (earlier) entry.
      if (claimed.some(([s, e]) => index < e && end > s)) continue;
      claimed.push([index, end]);

      const negated = entry.acuityClass === "admin" ? false : isNegated(text, index, m[0].length);
      const thirdParty = entry.acuityClass === "admin" ? false : isThirdParty(text, index);
      entities.push({
        id: entry.id,
        label: entry.label,
        matched: m[0],
        index,
        acuity: entry.acuity,
        acuityClass: entry.acuityClass,
        negated,
        thirdParty,
      });
    }
  }

  entities.sort((a, b) => a.index - b.index);

  const activeEntities = entities.filter(
    (e) => !e.negated && !e.thirdParty && e.acuityClass !== "admin",
  );

  let baseAcuity = ADMIN_BASELINE_ACUITY;
  for (const e of activeEntities) baseAcuity = Math.max(baseAcuity, e.acuity);
  const activeIds = new Set(activeEntities.map((e) => e.id));
  for (const combo of COMBO_RULES) {
    if (combo.ids.every((id) => activeIds.has(id))) {
      baseAcuity = Math.max(baseAcuity, combo.acuity);
    }
  }

  return { entities, activeEntities, baseAcuity, normalizedText: text };
}
