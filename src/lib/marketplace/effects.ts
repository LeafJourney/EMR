// EMR-278 — derive a small set of "effect" descriptors for a product based
// on its strain type, cannabinoid loading, and dominant terpenes.
//
// Per the ticket, the eventual implementation should incorporate AI synthesis
// of reviews + the cannabinoid/terpene profile. This module provides a clean,
// deterministic v1 that ships today: rule-based mapping over the same data
// the AI would consume. The output shape is wire-compatible with whatever
// model-driven implementation replaces it.

export type StrainType = "indica" | "sativa" | "hybrid" | "n/a";

export interface EffectDerivationInput {
  strainType?: StrainType;
  thcContent?: number;
  cbdContent?: number;
  cbnContent?: number;
  terpeneProfile?: Record<string, number>;
  /** Optional product use-cases / symptoms — bias the effect set toward
   *  benefit framing when present (e.g., "anxiety" → "calming"). */
  symptoms?: string[];
  useCases?: string[];
}

// Tag preference order — when we have to truncate, keep the most
// informative descriptor first. Curated to feel natural reading L-to-R.
const TAG_PRIORITY: string[] = [
  "relaxing",
  "uplifting",
  "calming",
  "soothing",
  "energizing",
  "focused",
  "creative",
  "cerebral",
  "mellow",
  "sedating",
  "euphoric",
  "balanced",
  "couch lock",
  "giggly",
];

const TERPENE_EFFECTS: Record<string, string[]> = {
  myrcene: ["sedating", "mellow"],
  limonene: ["uplifting", "euphoric"],
  linalool: ["calming", "soothing"],
  pinene: ["focused", "cerebral"],
  caryophyllene: ["soothing"],
  humulene: ["mellow"],
  terpinolene: ["uplifting", "creative"],
  ocimene: ["uplifting"],
  bisabolol: ["calming"],
  eucalyptol: ["cerebral"],
};

const SYMPTOM_BIAS: Record<string, string[]> = {
  anxiety: ["calming", "soothing"],
  insomnia: ["sedating", "mellow"],
  sleep: ["sedating", "mellow"],
  pain: ["soothing", "relaxing"],
  inflammation: ["soothing"],
  fatigue: ["energizing", "uplifting"],
  depression: ["uplifting", "euphoric"],
  focus: ["focused", "cerebral"],
  adhd: ["focused"],
  appetite: ["giggly"],
};

const MAX_TAGS = 5;

export function deriveEffectTags(input: EffectDerivationInput): string[] {
  const pool = new Set<string>();

  // Strain backbone
  switch (input.strainType) {
    case "indica":
      pool.add("relaxing");
      pool.add("sedating");
      pool.add("mellow");
      break;
    case "sativa":
      pool.add("uplifting");
      pool.add("energizing");
      pool.add("creative");
      break;
    case "hybrid":
      pool.add("balanced");
      break;
    // "n/a" / undefined → no strain contribution
  }

  // Cannabinoid loading. Numbers are percentage points; treat falsy as 0.
  const thc = input.thcContent ?? 0;
  const cbd = input.cbdContent ?? 0;
  const cbn = input.cbnContent ?? 0;

  if (thc >= 20) {
    pool.add("euphoric");
    pool.add("cerebral");
  } else if (thc >= 12) {
    pool.add("uplifting");
  }
  if (cbd >= 10) {
    pool.add("calming");
    pool.add("soothing");
  }
  if (cbn >= 1) {
    pool.add("sedating");
  }

  // CBD-dominant (CBD ≥ 2× THC) products feel calming first, regardless of
  // any THC-driven euphoric flags we already added.
  if (cbd > 0 && thc > 0 && cbd >= 2 * thc) {
    pool.delete("euphoric");
    pool.delete("cerebral");
    pool.add("calming");
  }

  // Dominant terpenes (top 2 by concentration).
  const terps = input.terpeneProfile ?? {};
  const ranked = Object.entries(terps)
    .filter(([, v]) => typeof v === "number" && v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2);
  for (const [name] of ranked) {
    const effects = TERPENE_EFFECTS[name.toLowerCase()];
    if (effects) effects.forEach((e) => pool.add(e));
  }

  // Symptom / use-case bias
  const hints = [
    ...(input.symptoms ?? []),
    ...(input.useCases ?? []),
  ].map((s) => s.toLowerCase());
  for (const h of hints) {
    for (const [key, effects] of Object.entries(SYMPTOM_BIAS)) {
      if (h.includes(key)) effects.forEach((e) => pool.add(e));
    }
  }

  // Sort by curated priority, then truncate.
  const ordered = TAG_PRIORITY.filter((t) => pool.has(t));
  // Fold in any remaining tags not yet in the priority list (defensive).
  for (const t of pool) {
    if (!ordered.includes(t)) ordered.push(t);
  }
  return ordered.slice(0, MAX_TAGS);
}
