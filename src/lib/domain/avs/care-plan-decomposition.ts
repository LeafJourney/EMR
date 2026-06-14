// ───────────────────────────────────────────────────────────────────────────
// EMR-1150 — Care-plan decomposition
// ───────────────────────────────────────────────────────────────────────────
// Doc Phase 2: strip documentation artifacts from the signed plan text and
// isolate the *actual care changes* into structured buckets the calendar /
// roadmap renderer (EMR-1152) and the patient summary consume:
//
//   • medications  — action tag + molecule + dose + route + timing
//   • dietary      — time-restricted eating / fasting / macros / hydration
//   • behavioral   — sleep / activity / mindfulness / monitoring / substance
//
// Deterministic on purpose: the same plan text must always decompose the same
// way (testable, auditable, reproducible for the research datasets the Data
// Collection Philosophy requires). No model calls here.

import type {
  BehavioralItem,
  BehavioralKind,
  DecomposedCarePlan,
  DietaryKind,
  DietaryProtocol,
  MedicationAction,
  MedicationActionTag,
} from "./types";

/* -------------------------------------------------------------------------- */
/* Sentence segmentation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Split plan prose into candidate care-change sentences. Mirrors the leaflet's
 * extractActionItems segmentation (bullets first, sentence-split otherwise) so
 * the AVS and the leaflet agree on what counts as an action line.
 */
export function segmentPlan(planText: string): string[] {
  if (!planText) return [];
  const hasBullets = /(^|\n)\s*[-•*\d]/.test(planText);
  const lines = planText
    .split(/\n+/)
    .map((line) => line.replace(/^[\s\-•*]+/, "").replace(/^\d+[.)]\s*/, "").trim())
    .filter(Boolean);
  const candidates = hasBullets
    ? lines.flatMap((line) => line.split(/(?<=[.!?])\s+/))
    : lines.flatMap((line) => line.split(/(?<=[.!?])\s+/));
  return candidates.map((s) => s.trim()).filter((s) => s.length > 2);
}

/* -------------------------------------------------------------------------- */
/* Medication action lexicons                                                  */
/* -------------------------------------------------------------------------- */

const ACTION_VERBS: Array<{ tag: MedicationActionTag; pattern: RegExp }> = [
  // Order matters: "taper off" / "stop" must beat the generic "taper" → TITRATE.
  { tag: "DISCONTINUE", pattern: /\b(discontinue|discontinued|stop|stopping|cease|hold|holding|taper\s+off|d\/?c)\b/i },
  { tag: "TITRATE", pattern: /\b(titrate|titrating|increase|increasing|decrease|decreasing|up-?titrate|down-?titrate|adjust|adjusting|reduce|reducing|raise|bump|taper(?:\s+(?:up|down|to))?)\b/i },
  { tag: "INITIATE", pattern: /\b(start|starting|begin|beginning|initiate|initiating|add|adding|prescribe|prescribing|trial\s+of|commence)\b/i },
  { tag: "MAINTAIN", pattern: /\b(continue|continuing|maintain|maintaining|keep|remain\s+on|stay\s+on|ongoing|no\s+change)\b/i },
];

/** Known molecule / product names — high-precision anchor for the parser. */
const MOLECULE_LEXICON = [
  "metformin", "lisinopril", "atorvastatin", "rosuvastatin", "simvastatin",
  "sertraline", "escitalopram", "fluoxetine", "albuterol", "omeprazole",
  "pantoprazole", "amlodipine", "losartan", "hydrochlorothiazide", "hctz",
  "gabapentin", "pregabalin", "duloxetine", "levothyroxine", "insulin",
  "semaglutide", "ozempic", "wegovy", "empagliflozin", "jardiance",
  "melatonin", "trazodone", "naltrexone", "buprenorphine",
  // Cannabis / botanical — LeafJourney's home turf
  "cbd", "cannabidiol", "thc", "tetrahydrocannabinol", "cbn", "cbg",
  "cannabis", "marijuana", "epidiolex", "cannabis oil", "cbd oil", "thc oil",
];

const ROUTE_MAP: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(by mouth|orally|oral|po|p\.o\.)\b/i, label: "by mouth" },
  { pattern: /\b(sublingual(?:ly)?|under the tongue|s\/?l)\b/i, label: "under the tongue" },
  { pattern: /\b(inhal(?:e|ed|ation)|inhaler|puff)\b/i, label: "inhaled" },
  { pattern: /\b(topical(?:ly)?|on the skin)\b/i, label: "on the skin" },
  { pattern: /\b(subcutaneous(?:ly)?|sub-?q|subq|sc)\b/i, label: "as an injection under the skin" },
  { pattern: /\b(intramuscular(?:ly)?|i\.?m\.?)\b/i, label: "as a shot into the muscle" },
  { pattern: /\b(transdermal|patch)\b/i, label: "as a patch" },
  { pattern: /\b(rectal(?:ly)?|suppository)\b/i, label: "as a suppository" },
];

const TIMING_MAP: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(twice (?:a day|daily)|two times (?:a day|daily)|bid|b\.i\.d\.)\b/i, label: "twice daily" },
  { pattern: /\b(three times (?:a day|daily)|tid|t\.i\.d\.)\b/i, label: "three times daily" },
  { pattern: /\b(four times (?:a day|daily)|qid|q\.i\.d\.)\b/i, label: "four times daily" },
  { pattern: /\b(at bedtime|before bed|qhs|nightly|each night|every night)\b/i, label: "at bedtime" },
  { pattern: /\b(every morning|each morning|in the morning|qam|q\.a\.m\.)\b/i, label: "every morning" },
  { pattern: /\b(with meals|with food|with breakfast|with dinner)\b/i, label: "with meals" },
  { pattern: /\b(once (?:a day|daily)|every day|daily|qd|q\.d\.|q24h)\b/i, label: "once daily" },
  { pattern: /\b(as needed|prn|p\.r\.n\.)\b/i, label: "as needed" },
  { pattern: /\b(every other day|qod)\b/i, label: "every other day" },
  { pattern: /\b(weekly|once a week|every week)\b/i, label: "weekly" },
];

const DOSE_PATTERN =
  /\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|g|ml|milliliters?|units?|iu|puffs?|tablets?|tabs?|caps?|capsules?|drops?|sprays?|%)\b/i;

/* -------------------------------------------------------------------------- */
/* Field extractors (exported for unit tests)                                  */
/* -------------------------------------------------------------------------- */

export function extractDose(text: string): string | null {
  const m = text.match(DOSE_PATTERN);
  if (!m) return null;
  return m[0].replace(/\s+/g, " ").trim();
}

export function extractRoute(text: string): string | null {
  for (const { pattern, label } of ROUTE_MAP) if (pattern.test(text)) return label;
  return null;
}

export function extractTiming(text: string): string | null {
  for (const { pattern, label } of TIMING_MAP) if (pattern.test(text)) return label;
  return null;
}

/** Classify a sentence's medication action verb, or null if none present. */
export function classifyMedicationAction(text: string): MedicationActionTag | null {
  for (const { tag, pattern } of ACTION_VERBS) if (pattern.test(text)) return tag;
  return null;
}

const MOLECULE_STOPWORDS = new Set([
  "the", "a", "an", "your", "his", "her", "their", "patient", "patient's",
  "dose", "daily", "to", "of", "on", "with", "and", "for", "by", "at",
  "mg", "mcg", "ml", "g", "units", "tablet", "tablets", "capsule",
]);

/** Best-effort molecule extraction: lexicon hit first, else token after verb. */
export function extractMolecule(text: string): string | null {
  const lower = text.toLowerCase();
  // Prefer multi-word lexicon entries (e.g. "cbd oil") over single words.
  const sorted = [...MOLECULE_LEXICON].sort((a, b) => b.length - a.length);
  for (const drug of sorted) {
    if (new RegExp(`\\b${drug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(lower)) {
      return drug.replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  // Fall back to the first meaningful token after the action verb.
  for (const { pattern } of ACTION_VERBS) {
    const m = text.match(new RegExp(pattern.source + "\\s+(.+)", "i"));
    if (m?.[1]) {
      const token = m[1]
        .split(/\s+/)
        .find(
          (t) =>
            t.length > 2 &&
            !MOLECULE_STOPWORDS.has(t.toLowerCase()) &&
            !DOSE_PATTERN.test(t) &&
            /[a-z]/i.test(t),
        );
      if (token) {
        return token.replace(/[^\w-]/g, "").replace(/\b\w/g, (c) => c.toUpperCase());
      }
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Dietary + behavioral lexicons                                               */
/* -------------------------------------------------------------------------- */

const FASTING_WINDOW_PATTERN = /\b(\d{1,2})\s*[:\/]\s*(\d{1,2})\b/;

const DIETARY_RULES: Array<{ kind: DietaryKind; pattern: RegExp }> = [
  { kind: "time_restricted_eating", pattern: /\b(time-?restricted eating|tre|eating window|\d{1,2}\s*[:\/]\s*\d{1,2})\b/i },
  // NB: no bare "if"/"fast" alternatives — they false-match "if tolerated"
  // and "breakfast". Spelled-out forms only.
  { kind: "fasting", pattern: /\b(intermittent fasting|fasting|water fast|overnight fast)\b/i },
  { kind: "macronutrient", pattern: /\b(low-?carb|low-?carbohydrate|keto(?:genic)?|protein|macros?|macronutrients?|carbohydrate|sugar|mediterranean diet|whole-?food|plant-?based)\b/i },
  { kind: "hydration", pattern: /\b(hydration|water intake|drink water|fluids?|electrolytes?)\b/i },
];

const BEHAVIORAL_RULES: Array<{ kind: BehavioralKind; pattern: RegExp }> = [
  { kind: "sleep", pattern: /\b(sleep|bedtime routine|sleep hygiene|hours of sleep|wind-?down)\b/i },
  { kind: "activity", pattern: /\b(walk|walking|exercise|steps|cardio|strength training|resistance|zone 2|zone two|aerobic|workout|movement|physical activity|swim|cycling|yoga)\b/i },
  { kind: "mindfulness", pattern: /\b(mindfulness|meditat|breathing|breathwork|stress (?:reduction|management)|relaxation|journaling)\b/i },
  { kind: "monitoring", pattern: /\b(log|track|monitor|check (?:your )?(?:glucose|blood sugar|blood pressure|bp|weight)|weigh|cgm|home blood pressure|diary)\b/i },
  { kind: "substance", pattern: /\b(reduce alcohol|cut back on alcohol|quit smoking|stop smoking|tobacco|nicotine|caffeine reduction|limit alcohol)\b/i },
];

const ACTIVITY_TARGET_PATTERN =
  /\b(\d+(?:[-–]\d+)?\s*(?:hours?|hrs?|minutes?|mins?|steps|miles?|km|reps?|days?\s*(?:a|per)\s*week|x\s*(?:a|per)\s*week))\b/i;

/** Pull a quantified behavioral target ("30 minutes", "7–8 hours", "10,000 steps"). */
export function extractBehavioralTarget(text: string): string | null {
  const steps = text.match(/\b[\d,]{3,}\s*steps\b/i);
  if (steps) return steps[0].replace(/\s+/g, " ").trim();
  const m = text.match(ACTIVITY_TARGET_PATTERN);
  return m ? m[0].replace(/\s+/g, " ").trim() : null;
}

/** Normalize a fasting/eating window to "H:MM"-style "14:10". */
export function extractFastingWindow(text: string): string | null {
  const m = text.match(FASTING_WINDOW_PATTERN);
  if (!m) return null;
  return `${Number(m[1])}:${Number(m[2])}`;
}

/* -------------------------------------------------------------------------- */
/* Main entry                                                                   */
/* -------------------------------------------------------------------------- */

const DIET_BEHAVIOR_HINT =
  /\b(fasting|fast\b|eating window|time-?restricted|intermittent|low-?carb|keto|protein|macro|hydration|water|walk|exercise|steps|sleep|mindful|meditat|breathing|stress|cardio|zone 2|alcohol|smoking|caffeine|monitor|log|track|weigh)\b/i;

function classifyDietary(text: string): DietaryProtocol | null {
  for (const { kind, pattern } of DIETARY_RULES) {
    if (pattern.test(text)) {
      return { kind, window: extractFastingWindow(text), detail: text, raw: text };
    }
  }
  return null;
}

function classifyBehavioral(text: string): BehavioralItem | null {
  for (const { kind, pattern } of BEHAVIORAL_RULES) {
    if (pattern.test(text)) {
      return { kind, target: extractBehavioralTarget(text), detail: text, raw: text };
    }
  }
  return null;
}

function classifyMedication(text: string): MedicationAction | null {
  const action = classifyMedicationAction(text);
  if (!action) return null;
  const dose = extractDose(text);
  const route = extractRoute(text);
  const timing = extractTiming(text);
  const molecule = extractMolecule(text);
  // Require a real medication signal so "continue walking daily" doesn't
  // masquerade as a MAINTAIN order.
  const hasSignal = Boolean(dose || route || (molecule && isKnownMolecule(molecule)));
  if (!hasSignal && !molecule) return null;
  if (!hasSignal && DIET_BEHAVIOR_HINT.test(text)) return null;
  return { action, molecule: molecule ?? "Medication", dose, route, timing, raw: text };
}

function isKnownMolecule(name: string): boolean {
  const lower = name.toLowerCase();
  return MOLECULE_LEXICON.some((d) => d === lower);
}

/**
 * Decompose signed plan text into the structured care-change buckets.
 *
 * Per-sentence priority: diet/behavior keywords win over a medication verb
 * (so "continue 14:10 fasting" is dietary, not a MAINTAIN drug order); a
 * medication is only recorded when there's a dose, route, or known molecule.
 */
export function decomposeCarePlan(planText: string): DecomposedCarePlan {
  const out: DecomposedCarePlan = {
    medications: [],
    dietary: [],
    behavioral: [],
    unclassified: [],
  };

  for (const sentence of segmentPlan(planText)) {
    const dietary = classifyDietary(sentence);
    if (dietary) {
      out.dietary.push(dietary);
      continue;
    }
    const behavioral = classifyBehavioral(sentence);
    if (behavioral) {
      out.behavioral.push(behavioral);
      continue;
    }
    const medication = classifyMedication(sentence);
    if (medication) {
      out.medications.push(medication);
      continue;
    }
    out.unclassified.push(sentence);
  }

  return out;
}
