// ───────────────────────────────────────────────────────────────────────────
// AVS document composition — the pure heart of the generation job (EMR-1149)
// ───────────────────────────────────────────────────────────────────────────
// Takes the already-loaded encounter facts and composes the full, structured,
// readability-checked, localized AvsDocument. Pure + deterministic (a `now` is
// injectable) so it's unit-testable without a database or model call. The
// agent does the I/O; this does the thinking.

import {
  computeReadability,
  DEFAULT_TARGET_GRADE_MAX,
  DEFAULT_TARGET_GRADE_MIN,
  simplifyForReadability,
} from "./readability";
import { decomposeCarePlan } from "./care-plan-decomposition";
import { buildLifestyleRoadmap, buildTitrationCalendars } from "./schedule";
import { localizeAvsDocument, localizeText } from "./localization";
import type { AvsDocument, SupportedLanguage } from "./types";

export interface BuildAvsInput {
  patientFirstName: string;
  visitDate: string;
  provider: string;
  /** The signed Plan block — drives decomposition + calendars + roadmap. */
  planText: string;
  /** Deterministic English recap (e.g. leaflet buildDeterministicNarrative). */
  baseNarrative: string;
  nextSteps: string[];
  followUp: string;
  language: SupportedLanguage;
  /** Verbatim signed-note text for the provider side-by-side verification. */
  sourceNote: string;
  targetGradeMin?: number;
  targetGradeMax?: number;
  /** Injected for deterministic tests; defaults to wall-clock. */
  now?: Date;
}

export function buildAvsDocument(input: BuildAvsInput): AvsDocument {
  const decomposed = decomposeCarePlan(input.planText);
  const calendars = buildTitrationCalendars(decomposed);
  const roadmap = buildLifestyleRoadmap(decomposed);

  // De-jargon + simplify the English narrative, then score it. Readability is
  // always measured on the English baseline (the FK math is English-tuned); the
  // localized prose inherits the same structural simplicity.
  const englishNarrative = simplifyForReadability(localizeText(input.baseNarrative, "en").text);
  const readability = computeReadability(englishNarrative, {
    targetGradeMin: input.targetGradeMin ?? DEFAULT_TARGET_GRADE_MIN,
    targetGradeMax: input.targetGradeMax ?? DEFAULT_TARGET_GRADE_MAX,
  });

  const generatedAt = (input.now ?? new Date()).toISOString();

  const baseDoc: AvsDocument = {
    version: 1,
    language: "en",
    patientFirstName: input.patientFirstName,
    visitDate: input.visitDate,
    provider: input.provider,
    narrative: englishNarrative,
    decomposed,
    calendars,
    roadmap,
    nextSteps: input.nextSteps.map((s) => simplifyForReadability(localizeText(s, "en").text)),
    followUp: localizeText(input.followUp, "en").text,
    readability,
    sourceNote: input.sourceNote,
    generatedAt,
  };

  if (input.language === "en") return baseDoc;
  return localizeAvsDocument(baseDoc, input.language);
}
