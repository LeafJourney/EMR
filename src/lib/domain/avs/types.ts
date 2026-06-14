// ───────────────────────────────────────────────────────────────────────────
// After-Visit Summary (AVS) — shared types
// Workflows Revisions doc: "Dynamic Patient-Facing Summaries" (EMR-1123).
// ───────────────────────────────────────────────────────────────────────────
// These types are the contract that flows through the whole AVS pipeline:
//   EMR-1150 care-plan decomposition  → DecomposedCarePlan
//   EMR-1152 calendar/roadmap render  → TitrationCalendar + LifestyleRoadmap
//   EMR-1151 readability/localization → ReadabilityScore + localized copy
//   EMR-1149 generation job           → AvsDocument (persisted in payload)
// Kept dependency-free so every layer (agent worker, server action, RSC, and
// the unit tests) can import it without pulling in Prisma or React.

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* Care-plan decomposition (EMR-1150)                                          */
/* -------------------------------------------------------------------------- */

/** The four discrete medication changes a plan can express. */
export type MedicationActionTag =
  | "DISCONTINUE"
  | "INITIATE"
  | "TITRATE"
  | "MAINTAIN";

export interface MedicationAction {
  action: MedicationActionTag;
  /** Plain molecule / product name ("metformin", "CBD oil"). */
  molecule: string;
  /** Dose as written ("500 mg", "0.25 mL"), or null when not stated. */
  dose: string | null;
  /** Route in plain language ("by mouth", "under the tongue"), or null. */
  route: string | null;
  /** Timing/frequency ("twice daily", "at bedtime"), or null. */
  timing: string | null;
  /** Source sentence the action was lifted from (provenance for review). */
  raw: string;
}

export type DietaryKind =
  | "time_restricted_eating"
  | "fasting"
  | "macronutrient"
  | "hydration"
  | "other";

export interface DietaryProtocol {
  kind: DietaryKind;
  /** Eating/fasting window when present ("14:10", "16:8", "12-hour"). */
  window: string | null;
  /** Plain-language instruction. */
  detail: string;
  raw: string;
}

export type BehavioralKind =
  | "sleep"
  | "activity"
  | "mindfulness"
  | "monitoring"
  | "substance"
  | "other";

export interface BehavioralItem {
  kind: BehavioralKind;
  /** Quantified target when present ("7–8 hours", "Zone 2", "10 minutes"). */
  target: string | null;
  detail: string;
  raw: string;
}

export interface DecomposedCarePlan {
  medications: MedicationAction[];
  dietary: DietaryProtocol[];
  behavioral: BehavioralItem[];
  /** Plan sentences that didn't match any structured bucket. */
  unclassified: string[];
}

/* -------------------------------------------------------------------------- */
/* Schedules + roadmaps (EMR-1152)                                            */
/* -------------------------------------------------------------------------- */

export interface TitrationStep {
  /** Inclusive 1-based day the step starts on. */
  startDay: number;
  /** Inclusive day the step ends on, or null for "ongoing". */
  endDay: number | null;
  /** Human range label ("Days 1–7", "Day 15 onward"). */
  dayRange: string;
  /** When in the day to take it ("Morning", "With dinner", "At bedtime"). */
  timeOfDay: string;
  /** Plain instruction for this step. */
  instruction: string;
  /** Optional goal/checkpoint for the step. */
  goal: string | null;
}

export interface TitrationCalendar {
  molecule: string;
  steps: TitrationStep[];
}

export interface RoadmapItem {
  /** Soft cartoon emoji per the Data Collection Philosophy (Apple-iOS feel). */
  icon: string;
  label: string;
  detail: string;
}

export interface LifestyleRoadmap {
  nutrition: RoadmapItem[];
  behavior: RoadmapItem[];
}

/* -------------------------------------------------------------------------- */
/* Readability + localization (EMR-1151)                                      */
/* -------------------------------------------------------------------------- */

export type SupportedLanguage = "en" | "es" | "vi";

export interface ReadabilityScore {
  /** Flesch–Kincaid grade approximation. */
  grade: number;
  avgWordLength: number;
  avgSentenceLength: number;
  /** Fraction (0–1) of words flagged as long/clinical. */
  medicalDensity: number;
  /** Composite Linguistic Accessibility Target Index (lower = more accessible). */
  index: number;
  targetGradeMin: number;
  targetGradeMax: number;
  /** True when `grade` lands inside the target band. */
  meetsTarget: boolean;
}

/* -------------------------------------------------------------------------- */
/* The persisted AVS document (EMR-1149 payload)                              */
/* -------------------------------------------------------------------------- */

export interface AvsMedicationSummary {
  name: string;
  dosage: string;
  instructions: string | null;
}

export interface AvsDocument {
  /** Schema version so persisted payloads can migrate forward safely. */
  version: 1;
  language: SupportedLanguage;
  patientFirstName: string;
  visitDate: string;
  provider: string;
  /** Warm 1–3 sentence recap (already localized + readability-checked). */
  narrative: string;
  decomposed: DecomposedCarePlan;
  calendars: TitrationCalendar[];
  roadmap: LifestyleRoadmap;
  nextSteps: string[];
  followUp: string;
  readability: ReadabilityScore;
  /** Verbatim signed-note text, for the provider side-by-side verification. */
  sourceNote: string;
  generatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Zod schema — validates payloads at the persistence boundary                 */
/* -------------------------------------------------------------------------- */

const medicationActionSchema = z.object({
  action: z.enum(["DISCONTINUE", "INITIATE", "TITRATE", "MAINTAIN"]),
  molecule: z.string(),
  dose: z.string().nullable(),
  route: z.string().nullable(),
  timing: z.string().nullable(),
  raw: z.string(),
});

const dietarySchema = z.object({
  kind: z.enum(["time_restricted_eating", "fasting", "macronutrient", "hydration", "other"]),
  window: z.string().nullable(),
  detail: z.string(),
  raw: z.string(),
});

const behavioralSchema = z.object({
  kind: z.enum(["sleep", "activity", "mindfulness", "monitoring", "substance", "other"]),
  target: z.string().nullable(),
  detail: z.string(),
  raw: z.string(),
});

export const decomposedCarePlanSchema = z.object({
  medications: z.array(medicationActionSchema),
  dietary: z.array(dietarySchema),
  behavioral: z.array(behavioralSchema),
  unclassified: z.array(z.string()),
});

const titrationStepSchema = z.object({
  startDay: z.number(),
  endDay: z.number().nullable(),
  dayRange: z.string(),
  timeOfDay: z.string(),
  instruction: z.string(),
  goal: z.string().nullable(),
});

const roadmapItemSchema = z.object({
  icon: z.string(),
  label: z.string(),
  detail: z.string(),
});

const readabilitySchema = z.object({
  grade: z.number(),
  avgWordLength: z.number(),
  avgSentenceLength: z.number(),
  medicalDensity: z.number(),
  index: z.number(),
  targetGradeMin: z.number(),
  targetGradeMax: z.number(),
  meetsTarget: z.boolean(),
});

export const avsDocumentSchema = z.object({
  version: z.literal(1),
  language: z.enum(["en", "es", "vi"]),
  patientFirstName: z.string(),
  visitDate: z.string(),
  provider: z.string(),
  narrative: z.string(),
  decomposed: decomposedCarePlanSchema,
  calendars: z.array(z.object({ molecule: z.string(), steps: z.array(titrationStepSchema) })),
  roadmap: z.object({
    nutrition: z.array(roadmapItemSchema),
    behavior: z.array(roadmapItemSchema),
  }),
  nextSteps: z.array(z.string()),
  followUp: z.string(),
  readability: readabilitySchema,
  sourceNote: z.string(),
  generatedAt: z.string(),
});

/** Parse + validate a persisted AVS payload (JSON from Prisma). */
export function parseAvsDocument(payload: unknown): AvsDocument {
  return avsDocumentSchema.parse(payload) as AvsDocument;
}

/** Non-throwing variant for render surfaces that should degrade gracefully. */
export function safeParseAvsDocument(payload: unknown): AvsDocument | null {
  const result = avsDocumentSchema.safeParse(payload);
  return result.success ? (result.data as AvsDocument) : null;
}
