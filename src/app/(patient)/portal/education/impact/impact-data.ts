// ---------------------------------------------------------------------------
// Cannabis Impact hub — curated, cited statistics (EMR-288)
// ---------------------------------------------------------------------------
// Every figure below carries a `source` label. Where a peer-reviewed DOI or
// authoritative report exists it is named; otherwise the figure is marked
// "illustrative — pending live data aggregation". Per the product vision, an
// AI agent continuously amalgamates public data, so headline figures here are
// directional rather than real-time.
// ---------------------------------------------------------------------------

export interface OutcomeSlice {
  /** Classification bucket label. */
  label: string;
  /** Pair count from the MCL corpus. */
  count: number;
  /** Emoji accent. */
  emoji: string;
  /** Tone hint mapped to design tokens in the view. */
  tone: "success" | "danger" | "neutral";
  /** One-line plain-language gloss. */
  blurb: string;
}

export interface BigStat {
  /** Numeric value used for the count-up animation. */
  value: number;
  /** Prefix rendered before the number (e.g. "$"). */
  prefix?: string;
  /** Suffix rendered after the number (e.g. "B", "K", "%"). */
  suffix?: string;
  /** Headline label. */
  label: string;
  /** Supporting detail line. */
  detail: string;
  /** Emoji accent. */
  emoji: string;
  /** Citation / source note shown as small text. */
  source: string;
}

export interface ComparisonRow {
  /** Risk / harm dimension being compared. */
  dimension: string;
  /** Alcohol column value. */
  alcohol: string;
  /** Opioids / pharmaceuticals column value. */
  pharma: string;
  /** Cannabis column value. */
  cannabis: string;
  /** Source note for the row. */
  source: string;
}

export interface ImpactData {
  outcomes: {
    totalAbstracts: number;
    totalPairs: number;
    slices: OutcomeSlice[];
    takeaway: string;
    source: string;
    doi: string;
  };
  economics: BigStat[];
  harmReduction: {
    headline: BigStat[];
    note: string;
    source: string;
  };
  comparison: {
    rows: ComparisonRow[];
    note: string;
  };
  disclaimer: {
    title: string;
    points: string[];
  };
}

export const IMPACT_DATA: ImpactData = {
  // -------------------------------------------------------------------------
  // 1. Outcomes classification — Medical Cannabis Library (MCL) framework
  // -------------------------------------------------------------------------
  outcomes: {
    totalAbstracts: 11441,
    totalPairs: 48461,
    slices: [
      {
        label: "Positive",
        count: 26450,
        emoji: "✅",
        tone: "success",
        blurb: "Cannabinoid showed a beneficial relationship with the condition.",
      },
      {
        label: "Negative",
        count: 19217,
        emoji: "⚠️",
        tone: "danger",
        blurb: "Cannabinoid showed an unfavorable or harmful relationship.",
      },
      {
        label: "Neutral",
        count: 2794,
        emoji: "⚖️",
        tone: "neutral",
        blurb: "No clear directional effect was reported.",
      },
    ],
    takeaway:
      "Across nearly 48,500 cannabinoid–condition pairs drawn from over 11,400 " +
      "PubMed abstracts, a majority were classified as positive — but a large " +
      "negative share is a reminder that cannabis is not universally beneficial.",
    source:
      "Medical Cannabis Library, Journal of Cannabis Research, 2025",
    doi: "10.1186/s42238-025-00295-7",
  },

  // -------------------------------------------------------------------------
  // 2. Economic impact — big-number cards (illustrative industry figures)
  // -------------------------------------------------------------------------
  economics: [
    {
      value: 38,
      prefix: "$",
      suffix: "B",
      label: "US legal market",
      detail: "Estimated annual legal cannabis retail sales in the United States.",
      emoji: "📊",
      source: "Illustrative — industry market reports (directional).",
    },
    {
      value: 4,
      prefix: "$",
      suffix: "B+",
      label: "State tax revenue",
      detail: "Approximate combined annual excise & sales tax collected by states.",
      emoji: "🏛️",
      source: "Illustrative — aggregated state revenue dashboards (directional).",
    },
    {
      value: 440,
      suffix: "K",
      label: "Jobs supported",
      detail: "Full-time-equivalent jobs across cultivation, retail, and ancillary roles.",
      emoji: "💼",
      source: "Illustrative — cannabis employment reports (directional).",
    },
  ],

  // -------------------------------------------------------------------------
  // 3. Lives saved / harm reduction (carefully worded, evidence-themed)
  // -------------------------------------------------------------------------
  harmReduction: {
    headline: [
      {
        value: 64,
        suffix: "%",
        label: "Lower opioid use reported",
        detail:
          "Share of patients in some chronic-pain surveys who reported reducing " +
          "opioid use after starting medical cannabis.",
        emoji: "💚",
        source: "Illustrative — themes from peer-reviewed patient-survey literature.",
      },
      {
        value: 0,
        suffix: "",
        label: "Documented fatal overdoses",
        detail:
          "No well-documented death has been attributed to cannabis (THC) overdose " +
          "alone — unlike opioids and alcohol.",
        emoji: "🛡️",
        source: "Themes from toxicology & public-health reviews.",
      },
    ],
    note:
      "Harm-reduction framing here summarizes themes in the peer-reviewed " +
      "literature on medical-cannabis-access states. Associations are not proof " +
      "of causation, and findings vary across studies. These figures are " +
      "directional and should not be read as a guarantee of individual outcomes.",
    source:
      "Illustrative — synthesized from peer-reviewed harm-reduction literature.",
  },

  // -------------------------------------------------------------------------
  // 4. Comparison vs alcohol & pharmaceuticals
  // -------------------------------------------------------------------------
  comparison: {
    rows: [
      {
        dimension: "Fatal overdose risk",
        alcohol: "Real — acute alcohol poisoning can be fatal",
        pharma: "High — opioids cause tens of thousands of US deaths yearly",
        cannabis: "No well-documented fatal overdose from THC alone",
        source: "CDC / NIDA mortality data; toxicology reviews.",
      },
      {
        dimension: "Physical dependence",
        alcohol: "Significant — alcohol-use disorder is common",
        pharma: "High for opioids & benzodiazepines",
        cannabis: "Possible (cannabis-use disorder) but generally milder",
        source: "NIDA; DSM-5 substance-use disorder criteria.",
      },
      {
        dimension: "Organ toxicity",
        alcohol: "Liver, heart, cancer risk with chronic use",
        pharma: "Varies — GI, renal, hepatic depending on drug",
        cannabis: "Smoke irritation; no major organ toxicity established",
        source: "Peer-reviewed long-term exposure reviews.",
      },
      {
        dimension: "Societal harm score",
        alcohol: "Ranked most harmful in multi-criteria analyses",
        pharma: "Opioids rank high on harm-to-others",
        cannabis: "Ranks well below alcohol on combined harm",
        source: "Nutt et al., Lancet 2010 (DOI: 10.1016/S0140-6736(10)61462-6).",
      },
    ],
    note:
      "Comparison is for educational context only. It contrasts population-level " +
      "risk profiles and is not a recommendation to substitute one substance for " +
      "another. Individual risk depends on health status, dose, and route.",
  },

  // -------------------------------------------------------------------------
  // 5. Educational disclaimer
  // -------------------------------------------------------------------------
  disclaimer: {
    title: "Read this before you draw conclusions",
    points: [
      "This page is educational and is not medical advice.",
      "Figures are aggregated, illustrative, and sourced where possible — many " +
        "are directional rather than real-time.",
      "An AI agent continuously amalgamates public data (PubMed, industry & " +
        "public-health reports), so headline numbers will shift over time.",
      "Associations in research are not the same as proof of cause and effect.",
      "Always talk to your healthcare provider before changing any treatment.",
    ],
  },
};
