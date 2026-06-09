// EMR-339 — Wellness module content (Leafmart public surface).
//
// COMPLIANCE: All copy here is de-medicalized. No disease/condition framing,
// no "treats/cures/relieves" claims, and none of the banned trigger words
// ("anxiety", "pain", "inflammation", "sleep disorder", "PTSD", "addiction").
// Language stays wellness-oriented: calm, ease, rest, unwind, steady,
// grounded, mindfulness, restful evenings. This is general wellness and
// education only — not medical advice.

export type Practice = {
  emoji: string;
  title: string;
  description: string;
  /** Friendly duration label, e.g. "5 min". Optional. */
  duration?: string;
};

/** Box breathing + 4-7-8 patterns for the interactive pacer. */
export type BreathPattern = {
  id: string;
  name: string;
  summary: string;
  /** Phase durations in seconds. A hold of 0 is skipped by the pacer. */
  phases: { label: string; seconds: number }[];
};

export const BREATH_PATTERNS: BreathPattern[] = [
  {
    id: "box",
    name: "Box breathing",
    summary: "Even, square rhythm — in, hold, out, hold. A steady reset.",
    phases: [
      { label: "Breathe in", seconds: 4 },
      { label: "Hold", seconds: 4 },
      { label: "Breathe out", seconds: 4 },
      { label: "Hold", seconds: 4 },
    ],
  },
  {
    id: "478",
    name: "4 · 7 · 8",
    summary: "A longer exhale to help you unwind and settle into calm.",
    phases: [
      { label: "Breathe in", seconds: 4 },
      { label: "Hold", seconds: 7 },
      { label: "Breathe out", seconds: 8 },
    ],
  },
];

export const MEDITATIONS: Practice[] = [
  {
    emoji: "🌬️",
    title: "One mindful minute",
    description:
      "Pause and follow a single slow breath in and out. A tiny moment of stillness you can take anywhere.",
    duration: "1 min",
  },
  {
    emoji: "🧘",
    title: "Body scan",
    description:
      "Gently notice each part of the body from head to toe, letting attention soften and settle as you go.",
    duration: "8 min",
  },
  {
    emoji: "🍃",
    title: "Grounding senses",
    description:
      "Name what you can see, hear, and feel right now. A simple way to land back in the present moment.",
    duration: "5 min",
  },
  {
    emoji: "💭",
    title: "Loving-kindness",
    description:
      "Offer a few quiet, kind wishes — first to yourself, then outward to others. Warm and steadying.",
    duration: "6 min",
  },
  {
    emoji: "🌅",
    title: "Morning intention",
    description:
      "Take a calm breath and choose one word for the day ahead. A gentle, grounded way to begin.",
    duration: "3 min",
  },
];

export const MOVEMENT_FLOWS: Practice[] = [
  {
    emoji: "🤸",
    title: "Gentle wake-up flow",
    description:
      "Slow stretches to greet the morning — reach, fold, and roll the shoulders to feel loose and easy.",
    duration: "7 min",
  },
  {
    emoji: "🧎",
    title: "Grounded standing flow",
    description:
      "Steady, balanced poses that help you feel rooted and present, moving with the rhythm of your breath.",
    duration: "10 min",
  },
  {
    emoji: "🌙",
    title: "Wind-down stretch",
    description:
      "Soft, floor-based stretches to release the day and ease into restful evenings.",
    duration: "8 min",
  },
];

export const REST_RITUALS: Practice[] = [
  {
    emoji: "🕯️",
    title: "Dim the lights",
    description:
      "Lower the lights an hour before bed and let your space signal that the day is winding down.",
  },
  {
    emoji: "📵",
    title: "Screen-free wind-down",
    description:
      "Set screens aside and trade them for a few calm pages or quiet music to unwind.",
  },
  {
    emoji: "🍵",
    title: "Warm evening ritual",
    description:
      "A warm, caffeine-free drink and a slow moment to yourself — a cozy cue for restful evenings.",
  },
  {
    emoji: "🛁",
    title: "Soften the senses",
    description:
      "A warm soak or a soothing scent to help the body feel relaxed and ready for rest.",
  },
];

/** Rotating reflection prompts for the gratitude card. */
export const GRATITUDE_PROMPTS: string[] = [
  "Name one small thing that made today a little brighter.",
  "Who or what are you thankful for right now?",
  "What is something your body did well for you today?",
  "Recall a moment that felt calm or grounded.",
  "What is one kind thing you can offer yourself tomorrow?",
];
