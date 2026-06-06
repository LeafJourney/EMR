/**
 * EMR-870 — Validated assessment / screener catalog
 *
 * Dr. Patel's chart redesign asks that every standardized instrument the
 * clinic uses (anxiety, depression, pain, cognition, substance use, sleep,
 * trauma, hepatic risk) be a single, queryable catalog so a `/assess` slash
 * command, the AI scribe, and the research export all speak the same
 * vocabulary.
 *
 * Each entry carries its scoring envelope (max score + ascending severity
 * cutoffs) plus an emoji for the "fun > friction" surface. `interpretScore`
 * turns a raw number into a normal/mild/moderate/severe band with a
 * human-readable label, honoring instruments where a *lower* score is worse
 * (MMSE, MoCA, GDS are inverted relative to the usual screener).
 *
 * Pure data + helpers only — no React, no project imports.
 */

export interface AssessmentDef {
  slug: string; // e.g. "gad-7"
  title: string; // e.g. "GAD-7"
  fullName: string; // "Generalized Anxiety Disorder 7"
  maxScore: number | null;
  /** ascending lower-bound cutoffs; score >= severe => severe band, etc. */
  cutoffs: { mild: number; moderate: number; severe: number } | null;
  /** higher score = worse? (most screeners yes; MMSE/MOCA are inverted) */
  higherIsWorse: boolean;
  emoji: string;
}

export const ASSESSMENTS: readonly AssessmentDef[] = [
  {
    slug: "gad-7",
    title: "GAD-7",
    fullName: "Generalized Anxiety Disorder 7",
    maxScore: 21,
    cutoffs: { mild: 5, moderate: 10, severe: 15 },
    higherIsWorse: true,
    emoji: "😰",
  },
  {
    slug: "phq-9",
    title: "PHQ-9",
    fullName: "Patient Health Questionnaire 9",
    maxScore: 27,
    cutoffs: { mild: 5, moderate: 10, severe: 20 },
    higherIsWorse: true,
    emoji: "😞",
  },
  {
    slug: "pain-vas",
    title: "Pain VAS",
    fullName: "Visual Analog Scale for Pain",
    maxScore: 10,
    cutoffs: { mild: 4, moderate: 7, severe: 9 },
    higherIsWorse: true,
    emoji: "🤕",
  },
  {
    slug: "gcs",
    title: "GCS",
    fullName: "Glasgow Coma Scale",
    maxScore: 15,
    // GCS: lower is worse. Bands map to severity of brain injury.
    cutoffs: { mild: 13, moderate: 9, severe: 3 },
    higherIsWorse: false,
    emoji: "🧠",
  },
  {
    slug: "mmse",
    title: "MMSE",
    fullName: "Mini-Mental State Examination",
    maxScore: 30,
    // lower is worse: >=24 normal, 18-23 mild, 10-17 moderate, <10 severe
    cutoffs: { mild: 24, moderate: 18, severe: 10 },
    higherIsWorse: false,
    emoji: "🧩",
  },
  {
    slug: "moca",
    title: "MoCA",
    fullName: "Montreal Cognitive Assessment",
    maxScore: 30,
    // lower is worse: >=26 normal, 18-25 mild, 10-17 moderate, <10 severe
    cutoffs: { mild: 26, moderate: 18, severe: 10 },
    higherIsWorse: false,
    emoji: "🧠",
  },
  {
    slug: "meld",
    title: "MELD",
    fullName: "Model for End-Stage Liver Disease",
    maxScore: 40,
    cutoffs: { mild: 10, moderate: 20, severe: 30 },
    higherIsWorse: true,
    emoji: "🫀",
  },
  {
    slug: "gds",
    title: "GDS",
    fullName: "Geriatric Depression Scale",
    maxScore: 15,
    cutoffs: { mild: 5, moderate: 9, severe: 12 },
    higherIsWorse: true,
    emoji: "👵",
  },
  {
    slug: "wells-dvt",
    title: "Wells (DVT)",
    fullName: "Wells Criteria for Deep Vein Thrombosis",
    maxScore: 9,
    // 0 low, 1-2 moderate probability, >=3 high probability
    cutoffs: { mild: 1, moderate: 1, severe: 3 },
    higherIsWorse: true,
    emoji: "🦵",
  },
  {
    slug: "wells-pe",
    title: "Wells (PE)",
    fullName: "Wells Criteria for Pulmonary Embolism",
    maxScore: 12,
    // <2 low, 2-6 moderate, >6 high probability
    cutoffs: { mild: 2, moderate: 2, severe: 7 },
    higherIsWorse: true,
    emoji: "🫁",
  },
  {
    slug: "audit",
    title: "AUDIT",
    fullName: "Alcohol Use Disorders Identification Test",
    maxScore: 40,
    cutoffs: { mild: 8, moderate: 16, severe: 20 },
    higherIsWorse: true,
    emoji: "🍺",
  },
  {
    slug: "cudit-r",
    title: "CUDIT-R",
    fullName: "Cannabis Use Disorders Identification Test - Revised",
    maxScore: 32,
    cutoffs: { mild: 8, moderate: 12, severe: 16 },
    higherIsWorse: true,
    emoji: "🌿",
  },
  {
    slug: "pcl-5",
    title: "PCL-5",
    fullName: "PTSD Checklist for DSM-5",
    maxScore: 80,
    cutoffs: { mild: 20, moderate: 33, severe: 50 },
    higherIsWorse: true,
    emoji: "💥",
  },
  {
    slug: "ess",
    title: "ESS",
    fullName: "Epworth Sleepiness Scale",
    maxScore: 24,
    cutoffs: { mild: 8, moderate: 11, severe: 16 },
    higherIsWorse: true,
    emoji: "😴",
  },
  {
    slug: "isi",
    title: "ISI",
    fullName: "Insomnia Severity Index",
    maxScore: 28,
    cutoffs: { mild: 8, moderate: 15, severe: 22 },
    higherIsWorse: true,
    emoji: "🌙",
  },
];

/** Look up an assessment definition by its stable slug. */
export function assessmentBySlug(slug: string): AssessmentDef | undefined {
  const needle = slug.trim().toLowerCase();
  return ASSESSMENTS.find((a) => a.slug.toLowerCase() === needle);
}

type Band = "normal" | "mild" | "moderate" | "severe";

const BAND_WORD: Record<Band, string> = {
  normal: "Normal",
  mild: "Mild",
  moderate: "Moderate",
  severe: "Severe",
};

/**
 * Domain words to humanize the band label per instrument. Falls back to the
 * generic "<Band> elevation" when an instrument isn't mapped.
 */
const DOMAIN_WORD: Record<string, string> = {
  "gad-7": "anxiety",
  "phq-9": "depression",
  "pain-vas": "pain",
  gcs: "impairment",
  mmse: "cognitive impairment",
  moca: "cognitive impairment",
  meld: "hepatic risk",
  gds: "depression",
  "wells-dvt": "DVT probability",
  "wells-pe": "PE probability",
  audit: "alcohol risk",
  "cudit-r": "cannabis risk",
  "pcl-5": "PTSD symptoms",
  ess: "sleepiness",
  isi: "insomnia",
};

/**
 * Turn a raw score into a severity band + human label.
 *
 * For `higherIsWorse` instruments the cutoffs are ascending lower bounds:
 * score >= severe => severe, >= moderate => moderate, >= mild => mild, else
 * normal. For inverted instruments (MMSE/MoCA/GCS/etc.) the cutoffs are
 * descending: score >= mild => normal, >= moderate => mild, >= severe =>
 * moderate, else severe.
 */
export function interpretScore(
  def: AssessmentDef,
  score: number,
): { band: Band; label: string } {
  const domain = DOMAIN_WORD[def.slug] ?? "";

  if (!def.cutoffs) {
    const band: Band = "normal";
    return { band, label: domain ? `${BAND_WORD[band]} ${domain}` : BAND_WORD[band] };
  }

  const { mild, moderate, severe } = def.cutoffs;
  let band: Band;

  if (def.higherIsWorse) {
    if (score >= severe) band = "severe";
    else if (score >= moderate) band = "moderate";
    else if (score >= mild) band = "mild";
    else band = "normal";
  } else {
    // inverted: higher = healthier. mild cutoff is the "normal" floor.
    if (score >= mild) band = "normal";
    else if (score >= moderate) band = "mild";
    else if (score >= severe) band = "moderate";
    else band = "severe";
  }

  const label =
    band === "normal"
      ? domain
        ? `Normal ${domain}`
        : "Normal"
      : domain
        ? `${BAND_WORD[band]} ${domain}`
        : `${BAND_WORD[band]} elevation`;

  return { band, label };
}
