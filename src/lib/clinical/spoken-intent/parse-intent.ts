// ───────────────────────────────────────────────────────────────────────────
// EMR-1157 — Spoken-intent parser
// ───────────────────────────────────────────────────────────────────────────
// Turn a provider directive into draft, codeable orders:
//   • clinical targets → LOINC (labs → ServiceRequest) / SNOMED (lifestyle →
//     CarePlan), matched against the intent catalog
//   • temporal modifiers ("next week") → a concrete occurrencePeriod
//   • fasting labs auto-append the 12-hour water-fast instruction
//   • I_match ≥ threshold auto-stages; below routes to the verify queue
//
// Deterministic (a `now` is injectable) so the doc's example utterance always
// yields the same 2 ServiceRequests + 1 CarePlan the acceptance fixture asserts.

import {
  INTENT_CATALOG,
  LOOSE_CONFIDENCE,
  PRIMARY_CONFIDENCE,
  type IntentCatalogEntry,
} from "./catalog";
import {
  FASTING_INSTRUCTION,
  INTENT_MATCH_THRESHOLD,
  type DraftOrder,
  type OccurrencePeriod,
  type ParsedIntent,
} from "./types";

export interface ParseOptions {
  /** Injected clock for deterministic occurrencePeriod resolution. */
  now?: Date;
  /** Override the I_match auto-stage cutoff (default 0.88). */
  threshold?: number;
}

/* -------------------------------------------------------------------------- */
/* Segmentation                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Split a directive into clauses on punctuation + "and then". We deliberately
 * do NOT split bare " and " so "fasting insulin and NMR lipoprofile next week"
 * stays one clause and the trailing temporal applies to both labs.
 */
export function splitSegments(utterance: string): string[] {
  return utterance
    .split(/[,;]|\.\s+|\band then\b/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/* -------------------------------------------------------------------------- */
/* Temporal resolution                                                        */
/* -------------------------------------------------------------------------- */

const WORD_NUMBERS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12,
};

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

function period(now: Date, startOffset: number, endOffset: number, label: string): OccurrencePeriod {
  return {
    start: addDays(now, startOffset).toISOString(),
    end: addDays(now, endOffset).toISOString(),
    label,
  };
}

/** Resolve a temporal phrase in `text` to a concrete window, or null. */
export function parseTemporal(text: string, now: Date): OccurrencePeriod | null {
  const t = text.toLowerCase();
  if (/\btoday\b/.test(t)) return period(now, 0, 1, "today");
  if (/\btomorrow\b/.test(t)) return period(now, 1, 2, "tomorrow");
  if (/\bnext week\b/.test(t)) return period(now, 7, 14, "next week");
  if (/\bthis week\b/.test(t)) return period(now, 0, 7, "this week");
  if (/\bnext month\b/.test(t)) return period(now, 30, 60, "next month");

  const rel = t.match(
    /\bin\s+(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\s*(day|days|week|weeks|month|months)\b/,
  );
  if (rel) {
    const n = WORD_NUMBERS[rel[1]] ?? Number(rel[1]);
    if (Number.isFinite(n) && n > 0) {
      const unit = rel[2];
      const days = unit.startsWith("day") ? n : unit.startsWith("week") ? n * 7 : n * 30;
      return period(now, days, days + 1, `in ${rel[1]} ${rel[2]}`);
    }
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Catalog matching                                                           */
/* -------------------------------------------------------------------------- */

function phraseRegex(phrase: string): RegExp {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`\\b${escaped}\\b`, "i");
}

interface Match {
  entry: IntentCatalogEntry;
  phrase: string;
  confidence: number;
}

function matchTargets(segment: string): Match[] {
  const matches: Match[] = [];
  for (const entry of INTENT_CATALOG) {
    const primaryHit = entry.primary.find((p) => phraseRegex(p).test(segment));
    if (primaryHit) {
      matches.push({ entry, phrase: primaryHit, confidence: PRIMARY_CONFIDENCE });
      continue;
    }
    const looseHit = entry.loose.find((p) => phraseRegex(p).test(segment));
    if (looseHit) {
      matches.push({ entry, phrase: looseHit, confidence: LOOSE_CONFIDENCE });
    }
  }
  return matches;
}

/** Eating/fasting window for a lifestyle regimen ("14:10", "16:8" → "16:8"). */
export function extractWindow(text: string): string | null {
  const m = text.match(/\b(\d{1,2})\s*[:\/]\s*(\d{1,2})\b/);
  return m ? `${Number(m[1])}:${Number(m[2])}` : null;
}

/* -------------------------------------------------------------------------- */
/* Main entry                                                                  */
/* -------------------------------------------------------------------------- */

export function parseSpokenIntent(utterance: string, opts: ParseOptions = {}): ParsedIntent {
  const now = opts.now ?? new Date();
  const threshold = opts.threshold ?? INTENT_MATCH_THRESHOLD;

  // Dedupe by catalog entry; keep the highest-confidence occurrence.
  const byEntry = new Map<string, DraftOrder>();

  for (const segment of splitSegments(utterance)) {
    const temporal = parseTemporal(segment, now);
    const window = extractWindow(segment);

    for (const { entry, phrase, confidence } of matchTargets(segment)) {
      const draft: DraftOrder = {
        resourceType: entry.resourceType,
        kind: entry.kind,
        code: { system: entry.system, code: entry.code, display: entry.display },
        name: entry.display,
        occurrencePeriod: temporal,
        fasting: entry.fasting ? { required: true, instruction: FASTING_INSTRUCTION } : null,
        detail: entry.kind === "lifestyle" ? window : null,
        confidence,
        intent: "draft",
        raw: phrase,
      };

      const existing = byEntry.get(entry.id);
      if (!existing || confidence > existing.confidence) {
        byEntry.set(entry.id, draft);
      }
    }
  }

  // ServiceRequests before CarePlans, then by code — deterministic ordering.
  const all = [...byEntry.values()].sort((a, b) => {
    if (a.resourceType !== b.resourceType) return a.resourceType === "ServiceRequest" ? -1 : 1;
    return a.code.code.localeCompare(b.code.code);
  });

  return {
    utterance,
    drafts: all.filter((d) => d.confidence >= threshold),
    lowConfidence: all.filter((d) => d.confidence < threshold),
  };
}
