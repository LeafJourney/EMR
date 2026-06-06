// EMR-942b — Top-10 "usual" qualifying conditions for medical marijuana.
//
// A curated, deterministic list of the conditions that appear most often across
// state medical-cannabis programs. Used by the qualifying-condition findings
// popup. Not state-specific — every program differs — so this is presented as
// "commonly qualifying" guidance.

export interface QualifyingCondition {
  name: string;
  /** One-line plain-language note on why it commonly qualifies. */
  note: string;
}

export const TOP_QUALIFYING_CONDITIONS: QualifyingCondition[] = [
  {
    name: "Chronic / severe pain",
    note: "The most widely accepted qualifying condition across nearly every state program.",
  },
  {
    name: "Cancer",
    note: "Qualifies broadly — including symptom and chemotherapy side-effect management.",
  },
  {
    name: "PTSD",
    note: "Post-traumatic stress disorder; a qualifying condition in most medical states.",
  },
  {
    name: "Epilepsy / seizures",
    note: "Seizure disorders are an early and near-universal qualifying condition.",
  },
  {
    name: "Multiple sclerosis / severe muscle spasms",
    note: "Spasticity and MS-related symptoms commonly qualify.",
  },
  {
    name: "Glaucoma",
    note: "A long-standing qualifying condition in many state programs.",
  },
  {
    name: "HIV / AIDS",
    note: "Qualifies for symptom and wasting-syndrome management.",
  },
  {
    name: "Crohn's disease / IBD",
    note: "Inflammatory bowel disease qualifies in many programs.",
  },
  {
    name: "Severe nausea",
    note: "Often qualifies, particularly when treatment-resistant or chemotherapy-related.",
  },
  {
    name: "Amyotrophic lateral sclerosis (ALS)",
    note: "A frequently listed terminal/neurodegenerative qualifying condition.",
  },
];
