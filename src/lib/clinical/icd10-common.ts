// EMR-1099 (M4 follow-on) — curated common ICD-10-CM codes for the prescribe
// diagnosis typeahead.
//
// Dr. Patel: "If typing in an 'ICD-10' code, have it populate like a drop down
// menu… type 'M54' and then underneath it should populate M54.5 (Back pain),
// M54.2 (Neck pain), M54.9 (Dorsalgia, unspecified)…"
//
// This is a CLIENT-SAFE, hand-curated high-frequency set (primary-care +
// cannabis/psilocybin-clinic weighted). It is intentionally NOT the full
// ~70k-code ICD-10-CM tabular — that's the upstream terminology pull job
// (see src/lib/terminology/index.ts / ADR-006). Until then this gives the
// provider real type-ahead for the codes they reach for daily, and the form
// also accepts any free-typed code so nothing is blocked by a gap in the list.

export interface Icd10Code {
  code: string;
  label: string;
}

export const ICD10_COMMON: Icd10Code[] = [
  // Musculoskeletal / pain (M)
  { code: "M54.5", label: "Low back pain" },
  { code: "M54.2", label: "Cervicalgia (neck pain)" },
  { code: "M54.6", label: "Pain in thoracic spine" },
  { code: "M54.9", label: "Dorsalgia, unspecified" },
  { code: "M54.16", label: "Radiculopathy, lumbar region" },
  { code: "M54.12", label: "Radiculopathy, cervical region" },
  { code: "M25.511", label: "Pain in right shoulder" },
  { code: "M25.512", label: "Pain in left shoulder" },
  { code: "M25.561", label: "Pain in right knee" },
  { code: "M25.562", label: "Pain in left knee" },
  { code: "M25.50", label: "Pain in unspecified joint" },
  { code: "M79.7", label: "Fibromyalgia" },
  { code: "M79.10", label: "Myalgia, unspecified site" },
  { code: "M79.601", label: "Pain in right arm" },
  { code: "M79.604", label: "Pain in right leg" },
  { code: "M19.90", label: "Osteoarthritis, unspecified site" },
  { code: "M17.0", label: "Bilateral primary osteoarthritis of knee" },
  { code: "M16.0", label: "Bilateral primary osteoarthritis of hip" },
  { code: "M06.9", label: "Rheumatoid arthritis, unspecified" },
  { code: "M62.838", label: "Other muscle spasm" },
  { code: "M47.812", label: "Spondylosis, cervical region" },
  { code: "M47.816", label: "Spondylosis, lumbar region" },
  { code: "M48.06", label: "Spinal stenosis, lumbar region" },

  // Nervous system (G)
  { code: "G89.4", label: "Chronic pain syndrome" },
  { code: "G89.29", label: "Other chronic pain" },
  { code: "G89.21", label: "Chronic pain due to trauma" },
  { code: "G89.3", label: "Neoplasm related pain (acute) (chronic)" },
  { code: "G89.18", label: "Other acute postprocedural pain" },
  { code: "G47.00", label: "Insomnia, unspecified" },
  { code: "G47.10", label: "Hypersomnia, unspecified" },
  { code: "G47.33", label: "Obstructive sleep apnea" },
  { code: "G43.909", label: "Migraine, unspecified, not intractable" },
  { code: "G43.709", label: "Chronic migraine without aura, not intractable" },
  { code: "G44.209", label: "Tension-type headache, unspecified" },
  { code: "G40.909", label: "Epilepsy, unspecified, not intractable" },
  { code: "G35", label: "Multiple sclerosis" },
  { code: "G20", label: "Parkinson's disease" },
  { code: "G58.9", label: "Mononeuropathy, unspecified" },
  { code: "G62.9", label: "Polyneuropathy, unspecified" },
  { code: "G90.50", label: "Complex regional pain syndrome I, unspecified" },
  { code: "G47.419", label: "Narcolepsy without cataplexy" },

  // Mental / behavioral (F)
  { code: "F41.1", label: "Generalized anxiety disorder" },
  { code: "F41.9", label: "Anxiety disorder, unspecified" },
  { code: "F41.0", label: "Panic disorder" },
  { code: "F32.9", label: "Major depressive disorder, single episode, unspecified" },
  { code: "F33.1", label: "Major depressive disorder, recurrent, moderate" },
  { code: "F43.10", label: "Post-traumatic stress disorder, unspecified" },
  { code: "F43.23", label: "Adjustment disorder with mixed anxiety and depressed mood" },
  { code: "F51.01", label: "Primary insomnia" },
  { code: "F90.9", label: "ADHD, unspecified type" },
  { code: "F31.9", label: "Bipolar disorder, unspecified" },
  { code: "F10.20", label: "Alcohol dependence, uncomplicated" },
  { code: "F11.20", label: "Opioid dependence, uncomplicated" },
  { code: "F12.20", label: "Cannabis dependence, uncomplicated" },
  { code: "F12.10", label: "Cannabis abuse, uncomplicated" },

  // Endocrine / metabolic (E)
  { code: "E11.9", label: "Type 2 diabetes mellitus without complications" },
  { code: "E11.65", label: "Type 2 diabetes mellitus with hyperglycemia" },
  { code: "E11.42", label: "Type 2 diabetes with diabetic polyneuropathy" },
  { code: "E10.9", label: "Type 1 diabetes mellitus without complications" },
  { code: "E78.5", label: "Hyperlipidemia, unspecified" },
  { code: "E78.00", label: "Pure hypercholesterolemia, unspecified" },
  { code: "E03.9", label: "Hypothyroidism, unspecified" },
  { code: "E05.90", label: "Thyrotoxicosis, unspecified" },
  { code: "E66.9", label: "Obesity, unspecified" },
  { code: "E55.9", label: "Vitamin D deficiency, unspecified" },
  { code: "E86.0", label: "Dehydration" },

  // Circulatory (I)
  { code: "I10", label: "Essential (primary) hypertension" },
  { code: "I11.9", label: "Hypertensive heart disease without heart failure" },
  { code: "I25.10", label: "Atherosclerotic heart disease of native coronary artery" },
  { code: "I48.91", label: "Atrial fibrillation, unspecified" },
  { code: "I50.9", label: "Heart failure, unspecified" },
  { code: "I73.9", label: "Peripheral vascular disease, unspecified" },
  { code: "I63.9", label: "Cerebral infarction, unspecified" },

  // Respiratory (J)
  { code: "J45.909", label: "Unspecified asthma, uncomplicated" },
  { code: "J44.9", label: "COPD, unspecified" },
  { code: "J30.9", label: "Allergic rhinitis, unspecified" },
  { code: "J02.9", label: "Acute pharyngitis, unspecified" },
  { code: "J06.9", label: "Acute upper respiratory infection, unspecified" },

  // Digestive (K)
  { code: "K21.9", label: "GERD without esophagitis" },
  { code: "K58.9", label: "Irritable bowel syndrome without diarrhea" },
  { code: "K50.90", label: "Crohn's disease, unspecified, without complications" },
  { code: "K51.90", label: "Ulcerative colitis, unspecified, without complications" },
  { code: "K59.00", label: "Constipation, unspecified" },
  { code: "K30", label: "Functional dyspepsia" },
  { code: "K92.2", label: "Gastrointestinal hemorrhage, unspecified" },

  // Genitourinary (N)
  { code: "N39.0", label: "Urinary tract infection, site not specified" },
  { code: "N40.0", label: "Benign prostatic hyperplasia without LUTS" },
  { code: "N18.3", label: "Chronic kidney disease, stage 3 (moderate)" },
  { code: "N18.9", label: "Chronic kidney disease, unspecified" },
  { code: "N94.6", label: "Dysmenorrhea, unspecified" },

  // Symptoms / signs (R)
  { code: "R51.9", label: "Headache, unspecified" },
  { code: "R11.2", label: "Nausea with vomiting, unspecified" },
  { code: "R11.0", label: "Nausea" },
  { code: "R10.9", label: "Unspecified abdominal pain" },
  { code: "R53.83", label: "Other fatigue" },
  { code: "R53.1", label: "Weakness" },
  { code: "R52", label: "Pain, unspecified" },
  { code: "R63.0", label: "Anorexia (loss of appetite)" },
  { code: "R63.4", label: "Abnormal weight loss" },
  { code: "R45.851", label: "Suicidal ideations" },
  { code: "R20.2", label: "Paresthesia of skin" },
  { code: "R25.2", label: "Cramp and spasm" },
  { code: "R42", label: "Dizziness and giddiness" },

  // Neoplasms (C/D)
  { code: "C50.919", label: "Malignant neoplasm of unspecified breast, unspecified" },
  { code: "C61", label: "Malignant neoplasm of prostate" },
  { code: "C18.9", label: "Malignant neoplasm of colon, unspecified" },
  { code: "C34.90", label: "Malignant neoplasm of unspecified lung" },
  { code: "D64.9", label: "Anemia, unspecified" },

  // Skin (L)
  { code: "L40.9", label: "Psoriasis, unspecified" },
  { code: "L20.9", label: "Atopic dermatitis, unspecified" },
  { code: "L30.9", label: "Dermatitis, unspecified" },
  { code: "L70.0", label: "Acne vulgaris" },

  // Eye / ear (H)
  { code: "H40.9", label: "Glaucoma, unspecified" },
  { code: "H40.11X0", label: "Primary open-angle glaucoma, stage unspecified" },
  { code: "H93.13", label: "Tinnitus, bilateral" },
  { code: "H81.10", label: "Benign paroxysmal vertigo, unspecified ear" },

  // Injury / external (S/T)
  { code: "S39.012A", label: "Strain of muscle of lower back, initial encounter" },
  { code: "T14.90", label: "Injury, unspecified" },

  // Sleep / fatigue / misc
  { code: "R40.0", label: "Somnolence" },
  { code: "Z79.891", label: "Long term (current) use of opiate analgesic" },
  { code: "Z79.899", label: "Other long term (current) drug therapy" },
  { code: "Z51.81", label: "Encounter for therapeutic drug level monitoring" },
];

const NORM = (s: string) => s.toLowerCase().replace(/[.\s]/g, "");

/**
 * Search the curated ICD-10 set by code prefix OR label substring.
 * Code-prefix matches (e.g. "M54" → all M54.x) rank ahead of label
 * matches (e.g. "back pain" → M54.5). Dots/spaces are ignored so both
 * "M545" and "M54.5" match.
 */
export function searchIcd10(query: string, limit = 8): Icd10Code[] {
  const q = NORM(query);
  if (!q) return [];
  const codeHits: Icd10Code[] = [];
  const labelHits: Icd10Code[] = [];
  for (const c of ICD10_COMMON) {
    if (NORM(c.code).startsWith(q)) codeHits.push(c);
    else if (c.label.toLowerCase().includes(query.toLowerCase().trim())) labelHits.push(c);
  }
  return [...codeHits, ...labelHits].slice(0, limit);
}
