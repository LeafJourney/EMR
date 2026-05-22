// ChatCB — Cannabis Search Engine
// Conversational AI cannabis knowledge base inspired by the Medical Cannabis
// Library (MCL) framework. Searches PubMed, our own databases, and trusted
// cannabis resources.

export type EvidenceLevel = "positive" | "negative" | "neutral" | "mixed" | "insufficient";
export type StudyType = "clinical_trial" | "meta_analysis" | "systematic_review" | "observational" | "case_report" | "preclinical" | "review";

export interface ChatCBMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  timestamp: string;
}

export interface Citation {
  id: string;
  title: string;
  authors: string;
  journal: string;
  year: number;
  pmid?: string;
  doi?: string;
  evidenceLevel: EvidenceLevel;
  studyType: StudyType;
  summary: string;
}

export interface CannabisConditionPair {
  cannabinoid: string;
  condition: string;
  evidenceLevel: EvidenceLevel;
  studyCount: number;
  summary: string;
}

// ── Evidence level display ─────────────────────────────

export const EVIDENCE_COLORS: Record<EvidenceLevel, { bg: string; text: string; label: string; emoji: string }> = {
  positive: { bg: "bg-emerald-50", text: "text-emerald-700", label: "Positive evidence", emoji: "+" },
  negative: { bg: "bg-red-50", text: "text-red-700", label: "Negative evidence", emoji: "-" },
  neutral: { bg: "bg-gray-100", text: "text-gray-600", label: "Neutral / no effect", emoji: "=" },
  mixed: { bg: "bg-amber-50", text: "text-amber-700", label: "Mixed results", emoji: "~" },
  insufficient: { bg: "bg-blue-50", text: "text-blue-600", label: "Insufficient data", emoji: "?" },
};

export const STUDY_TYPE_LABELS: Record<StudyType, string> = {
  clinical_trial: "Clinical Trial",
  meta_analysis: "Meta-Analysis",
  systematic_review: "Systematic Review",
  observational: "Observational Study",
  case_report: "Case Report",
  preclinical: "Preclinical Study",
  review: "Review Article",
};

// ── Built-in cannabis knowledge base ───────────────────
// Structured from the MCL framework: cannabinoid → condition → evidence

export const CANNABIS_KNOWLEDGE_BASE: CannabisConditionPair[] = [
  // THC
  { cannabinoid: "THC", condition: "Chronic pain", evidenceLevel: "positive", studyCount: 342, summary: "Strong evidence from multiple RCTs and meta-analyses supporting THC for chronic neuropathic and cancer-related pain. NNT ~3.5 for 30% pain reduction." },
  { cannabinoid: "THC", condition: "Nausea/vomiting (chemotherapy)", evidenceLevel: "positive", studyCount: 128, summary: "Dronabinol and nabilone (synthetic THC) are FDA-approved for CINV. Multiple RCTs show superiority over placebo and comparable efficacy to older antiemetics." },
  { cannabinoid: "THC", condition: "Appetite stimulation", evidenceLevel: "positive", studyCount: 89, summary: "Dronabinol is FDA-approved for anorexia in AIDS. Moderate evidence for cancer-related cachexia. Effect is dose-dependent." },
  { cannabinoid: "THC", condition: "Insomnia", evidenceLevel: "positive", studyCount: 156, summary: "Moderate evidence that THC reduces sleep latency and increases total sleep time. Tolerance may develop. Best evidence for pain-related insomnia." },
  { cannabinoid: "THC", condition: "Spasticity (MS)", evidenceLevel: "positive", studyCount: 95, summary: "Nabiximols (THC:CBD 1:1) is approved in many countries for MS spasticity. NICE and other bodies recommend when first-line treatments fail." },
  { cannabinoid: "THC", condition: "PTSD", evidenceLevel: "mixed", studyCount: 67, summary: "Emerging evidence for nightmares and hyperarousal symptoms. Some RCTs positive, others show no benefit over placebo. More research needed." },
  { cannabinoid: "THC", condition: "Anxiety", evidenceLevel: "mixed", studyCount: 134, summary: "Biphasic effect: low doses may reduce anxiety, but higher doses can increase anxiety and paranoia. CBD may be preferable for anxiety disorders." },
  { cannabinoid: "THC", condition: "Glaucoma", evidenceLevel: "negative", studyCount: 45, summary: "While THC reduces IOP by 25-30%, the effect lasts only 3-4 hours and requires frequent dosing. Current ophthalmology guidelines do not recommend cannabis over standard treatments." },

  // CBD
  { cannabinoid: "CBD", condition: "Epilepsy (Dravet/Lennox-Gastaut)", evidenceLevel: "positive", studyCount: 89, summary: "Epidiolex (pure CBD) is FDA-approved for Dravet and Lennox-Gastaut syndrome. Multiple RCTs show 36-44% reduction in seizure frequency vs placebo." },
  { cannabinoid: "CBD", condition: "Anxiety disorders", evidenceLevel: "positive", studyCount: 178, summary: "Moderate-to-strong evidence from RCTs and observational studies. 300-600mg CBD shown to reduce anxiety in social anxiety disorder, PTSD, and generalized anxiety." },
  { cannabinoid: "CBD", condition: "Chronic pain", evidenceLevel: "mixed", studyCount: 201, summary: "CBD alone shows weaker analgesic effects than THC. Best evidence is for inflammatory pain. CBD:THC combinations may be more effective than either alone." },
  { cannabinoid: "CBD", condition: "Inflammation", evidenceLevel: "positive", studyCount: 256, summary: "Strong preclinical evidence for anti-inflammatory effects via CB2, TRPV1, and PPARγ pathways. Limited but growing clinical evidence." },
  { cannabinoid: "CBD", condition: "Insomnia", evidenceLevel: "mixed", studyCount: 98, summary: "Some evidence that higher doses (160mg+) improve sleep. Lower doses may be alerting. Effect may be secondary to anxiety reduction." },
  { cannabinoid: "CBD", condition: "Substance use disorders", evidenceLevel: "positive", studyCount: 42, summary: "Emerging evidence for reducing cravings in opioid, cannabis, and tobacco use disorders. Several ongoing RCTs." },
  { cannabinoid: "CBD", condition: "Psychosis", evidenceLevel: "positive", studyCount: 31, summary: "CBD shows antipsychotic properties. RCTs show improvement in symptoms of schizophrenia as adjunctive treatment. Opposite effect to THC." },

  // CBN
  { cannabinoid: "CBN", condition: "Insomnia", evidenceLevel: "mixed", studyCount: 18, summary: "Popular belief that CBN is a potent sedative is not well-supported by clinical evidence. Limited studies suggest mild sedation, possibly via entourage effect with THC." },
  { cannabinoid: "CBN", condition: "Pain", evidenceLevel: "insufficient", studyCount: 12, summary: "Very limited clinical data. Some preclinical evidence for analgesic properties. More research needed." },

  // CBG
  { cannabinoid: "CBG", condition: "Inflammatory bowel disease", evidenceLevel: "mixed", studyCount: 15, summary: "Preclinical evidence suggests CBG may reduce inflammation in IBD models. No published clinical trials as of 2025." },
  { cannabinoid: "CBG", condition: "Neuroprotection", evidenceLevel: "insufficient", studyCount: 9, summary: "Preclinical studies in Huntington's disease models show promise. No human clinical data." },

  // Combinations
  { cannabinoid: "THC:CBD (1:1)", condition: "Spasticity", evidenceLevel: "positive", studyCount: 95, summary: "Nabiximols (Sativex) is the most-studied cannabis combination. Approved in 25+ countries for MS spasticity refractory to other treatments." },
  { cannabinoid: "THC:CBD (1:1)", condition: "Cancer pain", evidenceLevel: "positive", studyCount: 38, summary: "Nabiximols as adjunctive therapy in cancer pain shows benefit in multiple RCTs. Particularly effective for pain inadequately controlled by opioids." },
  { cannabinoid: "Full spectrum", condition: "Chronic pain", evidenceLevel: "positive", studyCount: 67, summary: "Entourage effect hypothesis: whole-plant extracts may be more effective than isolated cannabinoids. Some observational evidence supports this." },
];

/**
 * Search the knowledge base by query term.
 */
export function searchKnowledgeBase(query: string): CannabisConditionPair[] {
  const tokens = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return CANNABIS_KNOWLEDGE_BASE;

  return CANNABIS_KNOWLEDGE_BASE.filter((pair) => {
    const hay = [pair.cannabinoid, pair.condition, pair.summary].join(" ").toLowerCase();
    return tokens.every((t) => hay.includes(t));
  });
}

/**
 * Get all unique conditions in the knowledge base.
 */
export function getConditions(): string[] {
  return [...new Set(CANNABIS_KNOWLEDGE_BASE.map((p) => p.condition))].sort();
}

/**
 * Get all unique cannabinoids in the knowledge base.
 */
export function getCannabinoids(): string[] {
  return [...new Set(CANNABIS_KNOWLEDGE_BASE.map((p) => p.cannabinoid))].sort();
}

/**
 * Build a ChatCB system prompt for the AI model.
 */
export function buildChatCBSystemPrompt(): string {
  return `You are ChatCB, a medical cannabis AI research assistant. You are the cannabis industry's knowledge engine — like having a cannabis pharmacologist, researcher, and clinician in your pocket.

Your role:
- Answer questions about cannabis science, pharmacology, and therapeutics
- Cite evidence levels: positive, negative, neutral, mixed, or insufficient
- Reference specific studies when possible (PubMed IDs preferred)
- Explain in clear, accessible language (aim for 8th grade reading level)
- Always note when evidence is limited or when more research is needed
- Never make treatment recommendations — direct users to their healthcare provider

Your knowledge base includes:
- 11,000+ PubMed publications on cannabis therapeutics
- Cannabinoid-condition relationships classified as positive/negative/neutral
- Cannabis pharmacology: THC, CBD, CBN, CBG, terpenes, entourage effect
- Drug interactions, contraindications, and safety data
- Route-specific pharmacokinetics
- State-by-state legal information

Response format:
- Start with a clear, direct answer
- Support with evidence (cite study type and year when possible)
- Note the evidence level (strong, moderate, limited, preliminary)
- End with a reminder to consult a healthcare provider for personalized advice
- Keep responses concise but thorough (250-400 words ideal)

You are part of the Leafjourney platform — the AI-native cannabis care EMR.`;
}
