"use server";

import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { resolveModelClient } from "@/lib/orchestration/model-client";
import { logger } from "@/lib/observability/log";
import { readFileSync } from "fs";
import { join } from "path";

/* ── Types ──────────────────────────────────────────────────── */

export interface RecommendationCitation {
  title: string;
  pmid: string;
  url: string;
  summary: string;
}

export interface Recommendation {
  productType: string;
  cannabinoidRatio: string;
  startingDoseMg: string;
  deliveryMethod: string;
  frequency: string;
  citations: RecommendationCitation[];
  confidence: "high" | "moderate" | "low";
  rationale: string;
}

export type RecommendResult =
  // EMR-1098 (M1): savedId is the persisted CannabisRecommendation row — used
  // by "Apply to prescription" to carry the recommendation into /prescribe.
  // Null only if the audit write failed (the recommendation still displays).
  | { ok: true; recommendation: Recommendation; savedId: string | null }
  | { ok: false; error: string };

/* ── Corpus loader ──────────────────────────────────────────── */

interface ResearchStudy {
  title: string;
  pmid: string;
  url: string;
  summary: string;
  cannabinoids: string[];
  dose: Record<string, unknown>;
  delivery: string;
  outcome: string;
}

interface CorpusCategory {
  label: string;
  research: ResearchStudy[];
}

interface Corpus {
  meta: Record<string, unknown>;
  symptom_categories: Record<string, CorpusCategory>;
}

function loadCorpus(): Corpus {
  const filePath = join(process.cwd(), "data", "cannabis-research-corpus.json");
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as Corpus;
}

/* ── Keyword matching ───────────────────────────────────────── */

const SYMPTOM_KEYWORDS: Record<string, string[]> = {
  anxiety_depression: ["anxiety", "anxious", "depression", "depressed", "mood", "stress", "ptsd", "panic"],
  nausea_vomiting: ["nausea", "vomiting", "emesis", "chemotherapy", "cinv"],
  pain: ["pain", "neuropathy", "chronic pain", "neuropathic", "fibromyalgia", "arthritis"],
  sleep: ["sleep", "insomnia", "rest", "fatigue"],
  appetite_anorexia_cachexia: ["appetite", "anorexia", "cachexia", "weight loss", "eating"],
  fatigue: ["fatigue", "tired", "energy", "exhaustion"],
  headaches: ["headache", "migraine"],
  constipation: ["constipation", "bowel", "gi", "gastrointestinal"],
};

function findRelevantStudies(
  concerns: string,
  corpus: Corpus
): { category: string; studies: ResearchStudy[] }[] {
  const lower = concerns.toLowerCase();
  const matched: { category: string; studies: ResearchStudy[] }[] = [];

  for (const [catKey, keywords] of Object.entries(SYMPTOM_KEYWORDS)) {
    const hits = keywords.some((kw) => lower.includes(kw));
    if (hits && corpus.symptom_categories[catKey]) {
      const cat = corpus.symptom_categories[catKey];
      // Prefer positive-outcome studies
      const positiveStudies = cat.research.filter((s) => s.outcome === "positive");
      const studies = positiveStudies.length > 0 ? positiveStudies.slice(0, 3) : cat.research.slice(0, 2);
      matched.push({ category: cat.label, studies });
    }
  }

  // If nothing matched, search all categories for any keyword overlap with study titles
  if (matched.length === 0) {
    const words = lower.split(/\s+/).filter((w) => w.length > 3);
    for (const [catKey, cat] of Object.entries(corpus.symptom_categories)) {
      const titleMatches = cat.research.filter((s) =>
        words.some((w) => s.title.toLowerCase().includes(w) || s.summary.toLowerCase().includes(w))
      );
      if (titleMatches.length > 0) {
        matched.push({ category: cat.label, studies: titleMatches.slice(0, 2) });
      }
    }
  }

  return matched;
}

/* ── Template fallback ──────────────────────────────────────── */

function buildTemplateRecommendation(
  concerns: string,
  matchedStudies: { category: string; studies: ResearchStudy[] }[]
): Recommendation {
  // Flatten all matched studies
  const allStudies = matchedStudies.flatMap((m) => m.studies);
  const hasCBD = allStudies.some((s) => s.cannabinoids.includes("CBD"));
  const hasTHC = allStudies.some((s) => s.cannabinoids.includes("THC"));

  // Determine recommended approach from the evidence
  let productType = "Tincture (oil)";
  let ratio = "1:1 THC:CBD";
  let dose = "2.5-5 mg THC + 2.5-5 mg CBD";
  let delivery = "Oral (sublingual oil)";
  let frequency = "1-2 times daily, titrate weekly";

  if (hasCBD && !hasTHC) {
    ratio = "CBD-dominant (20:1 or higher)";
    dose = "25-50 mg CBD";
    frequency = "1-2 times daily";
  } else if (hasTHC && !hasCBD) {
    ratio = "THC-dominant";
    dose = "2.5-5 mg THC";
    frequency = "1-2 times daily, start low";
  }

  const lower = concerns.toLowerCase();
  if (lower.includes("sleep") || lower.includes("insomnia")) {
    delivery = "Oral (capsule or oil, 1 hour before bed)";
    frequency = "Once nightly, 1 hour before bed";
  }
  if (lower.includes("nausea")) {
    delivery = "Oral (capsule) or inhaled for acute relief";
    dose = "2.5 mg THC + 2.5 mg CBD per dose";
    frequency = "Up to 3 times daily as needed";
  }
  if (lower.includes("pain")) {
    delivery = "Oral (tincture) with optional topical for localized pain";
    frequency = "2-3 times daily, titrate every 3-5 days";
  }

  const citations: RecommendationCitation[] = allStudies.slice(0, 4).map((s) => ({
    title: s.title,
    pmid: s.pmid,
    url: s.url,
    summary: s.summary,
  }));

  return {
    productType,
    cannabinoidRatio: ratio,
    startingDoseMg: dose,
    deliveryMethod: delivery,
    frequency,
    citations,
    confidence: citations.length >= 3 ? "high" : citations.length >= 1 ? "moderate" : "low",
    rationale:
      `Based on ${citations.length} relevant ${citations.length === 1 ? "study" : "studies"} ` +
      `matching the patient's concerns (${concerns}). ` +
      `Recommendation follows a conservative "start low, go slow" approach. ` +
      `Clinical monitoring and dose titration are advised.`,
  };
}

/* ── LLM-based recommendation ──────────────────────────────── */

async function buildLLMRecommendation(
  patientSummary: string,
  matchedStudies: { category: string; studies: ResearchStudy[] }[]
): Promise<Recommendation | null> {
  const model = resolveModelClient();

  const studiesText = matchedStudies
    .flatMap((m) =>
      m.studies.map(
        (s) =>
          `- [PMID:${s.pmid}] "${s.title}" — ${s.summary} (${s.cannabinoids.join(", ")}; ${s.delivery}; outcome: ${s.outcome})`
      )
    )
    .join("\n");

  const prompt = `You are a cannabis medicine clinical decision support system. Based on the patient data and research evidence below, provide a structured treatment recommendation.

PATIENT:
${patientSummary}

RELEVANT RESEARCH:
${studiesText || "No specific studies matched. Use general best-practice guidelines."}

Respond in EXACTLY this JSON format (no markdown, no code fences):
{
  "productType": "...",
  "cannabinoidRatio": "...",
  "startingDoseMg": "...",
  "deliveryMethod": "...",
  "frequency": "...",
  "confidence": "high|moderate|low",
  "rationale": "..."
}

Guidelines:
- Start low, go slow
- Prefer evidence-backed dosing
- Consider delivery method appropriate to the condition
- Be conservative with THC dosing for new patients`;

  try {
    const raw = await model.complete(prompt, { maxTokens: 800, temperature: 0.3 });

    // Try to parse JSON from the response
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

    const allStudies = matchedStudies.flatMap((m) => m.studies);
    const citations: RecommendationCitation[] = allStudies.slice(0, 4).map((s) => ({
      title: s.title,
      pmid: s.pmid,
      url: s.url,
      summary: s.summary,
    }));

    return {
      productType: String(parsed.productType ?? "Tincture (oil)"),
      cannabinoidRatio: String(parsed.cannabinoidRatio ?? "1:1 THC:CBD"),
      startingDoseMg: String(parsed.startingDoseMg ?? "2.5-5 mg"),
      deliveryMethod: String(parsed.deliveryMethod ?? "Oral"),
      frequency: String(parsed.frequency ?? "1-2 times daily"),
      citations,
      confidence: (["high", "moderate", "low"].includes(String(parsed.confidence))
        ? String(parsed.confidence)
        : "moderate") as "high" | "moderate" | "low",
      rationale: String(parsed.rationale ?? "AI-generated recommendation based on available evidence."),
    };
  } catch {
    return null;
  }
}

/* ── Main server action ─────────────────────────────────────── */

export async function generateRecommendation(
  _prev: RecommendResult | null,
  formData: FormData
): Promise<RecommendResult> {
  const user = await requireUser();

  const patientId = formData.get("patientId") as string;
  if (!patientId) return { ok: false, error: "Missing patient ID." };

  // Load patient data
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });

  if (!patient) return { ok: false, error: "Patient not found." };

  // Load recent outcome trends
  const recentOutcomes = await prisma.outcomeLog.findMany({
    where: { patientId },
    orderBy: { loggedAt: "desc" },
    take: 20,
  });

  // Load assessment scores
  const recentAssessments = await prisma.assessmentResponse.findMany({
    where: { patientId },
    orderBy: { submittedAt: "desc" },
    take: 5,
    include: { assessment: true },
  });

  // Build patient summary
  const concerns = patient.presentingConcerns ?? "Not specified";
  const goals = patient.treatmentGoals ?? "Not specified";
  const history = patient.cannabisHistory
    ? JSON.stringify(patient.cannabisHistory)
    : "No prior cannabis history on file";

  const outcomeSummary = recentOutcomes.length > 0
    ? recentOutcomes
        .slice(0, 8)
        .map((o) => `${o.metric}: ${o.value}/10`)
        .join(", ")
    : "No outcome data recorded yet";

  const assessmentSummary = recentAssessments.length > 0
    ? recentAssessments
        .map((a) => `${a.assessment.title}: score ${a.score ?? "N/A"} (${a.interpretation ?? "no interpretation"})`)
        .join("; ")
    : "No assessments completed";

  const patientSummary = [
    `Name: ${patient.firstName} ${patient.lastName}`,
    `Presenting concerns: ${concerns}`,
    `Treatment goals: ${goals}`,
    `Cannabis history: ${history}`,
    `Recent outcomes: ${outcomeSummary}`,
    `Assessment scores: ${assessmentSummary}`,
  ].join("\n");

  // Search corpus
  const corpus = loadCorpus();
  const matchedStudies = findRelevantStudies(concerns, corpus);

  // Try LLM first, fall back to template
  let recommendation = await buildLLMRecommendation(patientSummary, matchedStudies);

  if (!recommendation) {
    recommendation = buildTemplateRecommendation(concerns, matchedStudies);
  }

  // EMR-1098 (M1): persist the recommendation so there is a durable record of
  // the decision support shown to the physician (it previously lived only in
  // React state). A failed write is logged but never blocks the result.
  let savedId: string | null = null;
  try {
    const saved = await prisma.cannabisRecommendation.create({
      data: {
        organizationId: user.organizationId!,
        patientId,
        createdById: user.id,
        createdByName:
          `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || "Provider",
        inputContext: { concerns, goals, outcomeSummary, assessmentSummary },
        recommendation: JSON.parse(JSON.stringify(recommendation)),
      },
    });
    savedId = saved.id;
  } catch (err) {
    logger.error({ event: "clinic.recommend.persist_failed", err });
  }

  return { ok: true, recommendation, savedId };
}
