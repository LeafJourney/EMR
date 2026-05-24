// Note block types used by the Scribe Agent and note editor

export type NoteBlockType = "summary" | "findings" | "assessment" | "plan" | "followUp";

export interface NoteBlock {
  type: NoteBlockType;
  heading: string;
  body: string;
}

/**
 * Display labels for note blocks — APSO format.
 * "summary" maps to Subjective, "findings" maps to Objective.
 */
export const NOTE_BLOCK_LABELS: Record<NoteBlockType, string> = {
  assessment: "Assessment",
  plan: "Plan",
  summary: "Subjective",
  findings: "Objective",
  followUp: "Follow-up",
};

/**
 * APSO ordering: Assessment, Plan, Subjective (summary), Objective (findings), Follow-up.
 * Dr. Patel prefers this over the traditional SOAP ordering.
 */
export const APSO_ORDER: NoteBlockType[] = [
  "assessment",
  "plan",
  "summary",
  "findings",
  "followUp",
];

export const PATIENT_DEMEANOR_OPTIONS = [
  { emoji: "\u{1F60A}", label: "Bright", value: "bright" },
  { emoji: "\u{1F642}", label: "Positive", value: "positive" },
  { emoji: "\u{1F610}", label: "Neutral", value: "neutral" },
  { emoji: "\u{1F614}", label: "Withdrawn", value: "withdrawn" },
  { emoji: "\u{1F622}", label: "Distressed", value: "distressed" },
] as const;

export type PatientDemeanor = typeof PATIENT_DEMEANOR_OPTIONS[number]["value"];

