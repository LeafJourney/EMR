// EMR-371 — LeafMart dosing-guide content (general, evidence-based, NOT medical
// advice). Each format entry is gated behind the disclaimer modal before a
// shopper can read it. Copy is intentionally educational and de-prescriptive:
// "start low, go slow", onset/duration ranges, and practical handling tips.

export interface DosingGuideEntry {
  /** Stable id used for deep-links (?format=tincture). */
  key: string;
  label: string;
  emoji: string;
  /** One-line shelf description. */
  blurb: string;
  onset: string;
  duration: string;
  /** Ordered "how to approach it" steps. */
  steps: string[];
  /** Practical handling / safety-minded tips. */
  tips: string[];
}

export const DOSING_GUIDE: DosingGuideEntry[] = [
  {
    key: "tincture",
    label: "Tinctures & oils",
    emoji: "💧",
    blurb: "Measured drops under the tongue — easy to titrate in small steps.",
    onset: "15–45 minutes",
    duration: "4–6 hours",
    steps: [
      "Start with the lowest marked measure on the dropper (often 0.25 mL).",
      "Hold under the tongue for 60 seconds before swallowing for faster onset.",
      "Wait the full onset window before considering more — effects build gradually.",
      "Adjust in small increments across separate days, not within one sitting.",
    ],
    tips: [
      "Keep a simple log of measure and how you felt to find your steady amount.",
      "Take with a little food if it feels harsh on an empty stomach.",
    ],
  },
  {
    key: "edible",
    label: "Edibles",
    emoji: "🍬",
    blurb: "Pre-portioned servings — slow onset, longer and stronger feel.",
    onset: "45–120 minutes",
    duration: "6–8 hours",
    steps: [
      "Begin with a single low serving and do not redose for at least 2 hours.",
      "Onset is delayed — it is easy to take more too soon, so be patient.",
      "Choose clearly labeled, lab-verified products with per-piece amounts.",
      "Plan for a calm window; effects can last most of the day.",
    ],
    tips: [
      "Eating on a full stomach softens and slows the experience.",
      "Store well away from children and pets — they look like candy.",
    ],
  },
  {
    key: "flower",
    label: "Flower",
    emoji: "🌿",
    blurb: "Fast feedback you can feel within minutes — easy to pace.",
    onset: "Within minutes",
    duration: "1–3 hours",
    steps: [
      "Take one small inhalation and wait several minutes before any more.",
      "Because onset is quick, you can stop as soon as you feel enough.",
      "Shorter duration makes it easier to keep to a gentle, paced approach.",
    ],
    tips: [
      "A single session in the evening is a common, easy place to start.",
      "Stay hydrated; keep water nearby.",
    ],
  },
  {
    key: "vape",
    label: "Vaporizers",
    emoji: "💨",
    blurb: "Quick onset like flower, in a measured, on-the-go format.",
    onset: "Within minutes",
    duration: "1–3 hours",
    steps: [
      "Take one short draw and wait a few minutes to read the effect.",
      "Use the device's lowest setting first if temperature is adjustable.",
      "Re-dose only after you have felt the first draw settle.",
    ],
    tips: [
      "Choose lab-verified hardware and cartridges with a COA on file.",
      "Let the device cool between sessions for a smoother experience.",
    ],
  },
  {
    key: "capsule",
    label: "Capsules & softgels",
    emoji: "💊",
    blurb: "Pre-measured, swallow-and-go — consistent like edibles.",
    onset: "45–90 minutes",
    duration: "6–8 hours",
    steps: [
      "Start with the lowest available capsule strength.",
      "Treat it like an edible: delayed onset, so don't redose early.",
      "Keep timing consistent day-to-day when you're finding your level.",
    ],
    tips: [
      "Take with water and, if preferred, a little food.",
      "Track the strength on the label so you can compare across days.",
    ],
  },
  {
    key: "topical",
    label: "Topicals & balms",
    emoji: "🧴",
    blurb: "Applied to the skin for a localized, non-intoxicating feel.",
    onset: "15–60 minutes",
    duration: "Varies",
    steps: [
      "Apply a thin layer to clean skin over the area you want to soothe.",
      "Most balms are non-intoxicating; reapply as the label directs.",
      "Patch-test a small area first if you have sensitive skin.",
    ],
    tips: [
      "Keep away from eyes and broken skin.",
      "Transdermal patches behave differently — read their label carefully.",
    ],
  },
];

export function dosingEntryForKey(key: string | undefined): DosingGuideEntry | undefined {
  if (!key) return undefined;
  return DOSING_GUIDE.find((e) => e.key === key);
}
