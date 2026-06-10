// Emoji Outcome Logging — per-product, per-dose data collection
// Dr. Patel Directive: Simple, fun, enjoyable. Emojis + scales.
// Every interaction = a data point for research, reimbursement, product dev.

export type EmojiRating = "great" | "good" | "neutral" | "bad" | "terrible";

export interface EmojiOption {
  value: EmojiRating;
  emoji: string;
  label: string;
  color: string;
}

export const EMOJI_OPTIONS: EmojiOption[] = [
  { value: "terrible", emoji: "😫", label: "Terrible", color: "bg-red-100 border-red-300 text-red-700" },
  { value: "bad", emoji: "😟", label: "Not great", color: "bg-orange-100 border-orange-300 text-orange-700" },
  { value: "neutral", emoji: "😐", label: "No change", color: "bg-gray-100 border-gray-300 text-gray-600" },
  { value: "good", emoji: "😊", label: "Good", color: "bg-emerald-100 border-emerald-300 text-emerald-700" },
  { value: "great", emoji: "🤩", label: "Amazing", color: "bg-emerald-200 border-emerald-400 text-emerald-800" },
];

export type QuickScale = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export interface ScaleDefinition {
  metric: string;
  label: string;
  lowLabel: string;
  highLabel: string;
  lowEmoji: string;
  highEmoji: string;
  description: string;
}

export const OUTCOME_SCALES: ScaleDefinition[] = [
  { metric: "pain", label: "Pain relief", lowLabel: "No relief", highLabel: "Complete relief", lowEmoji: "😣", highEmoji: "😌", description: "How much did this dose help your pain?" },
  { metric: "sleep", label: "Sleep quality", lowLabel: "Couldn't sleep", highLabel: "Best sleep ever", lowEmoji: "😩", highEmoji: "😴", description: "How well did you sleep after this dose?" },
  { metric: "anxiety", label: "Calm level", lowLabel: "Very anxious", highLabel: "Totally calm", lowEmoji: "😰", highEmoji: "🧘", description: "How calm do you feel?" },
  { metric: "mood", label: "Mood", lowLabel: "Very low", highLabel: "Great mood", lowEmoji: "😢", highEmoji: "😄", description: "How's your mood right now?" },
  { metric: "energy", label: "Energy", lowLabel: "Exhausted", highLabel: "Energized", lowEmoji: "🫠", highEmoji: "⚡", description: "How's your energy level?" },
  { metric: "appetite", label: "Appetite", lowLabel: "No appetite", highLabel: "Healthy appetite", lowEmoji: "🤢", highEmoji: "🍽️", description: "How's your appetite?" },
  { metric: "focus", label: "Focus", lowLabel: "Can't concentrate", highLabel: "Laser focused", lowEmoji: "🌫️", highEmoji: "🎯", description: "How focused do you feel?" },
  { metric: "nausea", label: "Nausea", lowLabel: "Very nauseous", highLabel: "No nausea", lowEmoji: "🤮", highEmoji: "👍", description: "Any nausea?" },
];

// ── Side effect quick-picks ────────────────────────────

export interface SideEffectOption {
  id: string;
  label: string;
  emoji: string;
}

export const SIDE_EFFECT_OPTIONS: SideEffectOption[] = [
  { id: "none", label: "No side effects", emoji: "✅" },
  { id: "dry_mouth", label: "Dry mouth", emoji: "🏜️" },
  { id: "drowsy", label: "Drowsy", emoji: "😴" },
  { id: "dizzy", label: "Dizzy", emoji: "💫" },
  { id: "anxious", label: "Anxious", emoji: "😰" },
  { id: "hungry", label: "Extra hungry", emoji: "🍕" },
  { id: "headache", label: "Headache", emoji: "🤕" },
  { id: "dry_eyes", label: "Dry eyes", emoji: "👁️" },
  { id: "nausea", label: "Nausea", emoji: "🤢" },
  { id: "paranoia", label: "Paranoia", emoji: "😨" },
  { id: "foggy", label: "Brain fog", emoji: "🌫️" },
  { id: "euphoric", label: "Euphoric", emoji: "🥳" },
];

// ── Emoji → score mapping (EMR-1113) ───────────────────
// 1-5 ordinal score for the emoji row; doubles as the `emoji=` marker value
// in the structured `[post_dose_feeling]` note convention.

export const EMOJI_RATING_SCORE: Record<EmojiRating, 1 | 2 | 3 | 4 | 5> = {
  terrible: 1,
  bad: 2,
  neutral: 3,
  good: 4,
  great: 5,
};

/**
 * Convert the 1-5 emoji rating into a 0-10 mood-style value so it lines up
 * with the rest of the OutcomeLog series (same mapping createFollowUpLog uses):
 * 1=terrible -> 1, 2=bad -> 3, 3=neutral -> 5, 4=good -> 7, 5=great -> 9.
 */
export function emojiRatingToMoodValue(rating: EmojiRating): number {
  return EMOJI_RATING_SCORE[rating] * 2 - 1;
}

export function getSideEffectOption(id: string): SideEffectOption | undefined {
  return SIDE_EFFECT_OPTIONS.find((o) => o.id === id);
}

// ── Post-dose scale → OutcomeLog conversion (EMR-1113) ─
// The quick-dose scales are *relief/quality* framed (10 = best outcome), but
// the OutcomeLog `pain` and `anxiety` metrics are *severity* framed
// (10 = worst) — see /portal/outcomes badge thresholds. Sleep is quality
// framed on both sides. Convert so post-dose points land correctly on the
// shared trend charts; the raw relief value is preserved in the note marker.

export const POST_DOSE_SCALE_METRICS = ["pain", "sleep", "anxiety"] as const;
export type PostDoseScaleMetric = (typeof POST_DOSE_SCALE_METRICS)[number];

export function postDoseScaleToOutcomeValue(
  metric: PostDoseScaleMetric,
  reliefValue: number
): number {
  return metric === "sleep" ? reliefValue : 10 - reliefValue;
}

// ── Quick dose log structure ───────────────────────────

export interface QuickDoseLog {
  productName: string;
  productId?: string;
  doseAmount: number;
  doseUnit: string;
  route: string;
  timestamp: string;
  overallFeeling: EmojiRating;
  scales: { metric: string; value: number }[];
  sideEffects: string[];
  notes?: string;
}

// ── Suggested prompts for check-in ─────────────────────

export const CHECK_IN_PROMPTS = [
  "How are you feeling after your dose?",
  "Quick check — how did that work for you?",
  "Rate your experience",
  "How's it going?",
  "Time for a quick check-in",
] as const;

export function getRandomPrompt(): string {
  return CHECK_IN_PROMPTS[Math.floor(Math.random() * CHECK_IN_PROMPTS.length)];
}
