import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { searchPubMed } from "@/lib/domain/pubmed";
import corpus from "../../../data/cannabis-research-corpus.json";

// ---------------------------------------------------------------------------
// Build a flat searchable index from the structured corpus
// ---------------------------------------------------------------------------

interface CorpusEntry {
  title: string;
  source: string;
  year: number | null;
  pmid: string | null;
  url: string | null;
  category: string;
  cannabinoids: string[];
  delivery: string | null;
  outcome: string | null;
  summary: string;
  doseInfo: string;
  tags: string[];
}

function buildIndex(): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  const categories = (corpus as any).symptom_categories as Record<string, any>;

  for (const [catKey, cat] of Object.entries(categories)) {
    const label = cat.label as string;

    // Index research studies
    for (const study of cat.research ?? []) {
      // Build dose info string
      const dose = study.dose;
      let doseInfo = "";
      if (dose) {
        const parts: string[] = [];
        if (dose.thc_mg) parts.push(`THC ${dose.thc_mg}mg`);
        if (dose.thc_mg_avg) parts.push(`THC avg ${dose.thc_mg_avg}mg`);
        if (dose.thc_mg_range) parts.push(`THC ${dose.thc_mg_range[0]}-${dose.thc_mg_range[1]}mg`);
        if (dose.cbd_mg) parts.push(`CBD ${dose.cbd_mg}mg`);
        if (dose.cbd_mg_median) parts.push(`CBD median ${dose.cbd_mg_median}mg`);
        if (dose.cbd_mg_range) parts.push(`CBD ${dose.cbd_mg_range[0]}-${dose.cbd_mg_range[1]}mg`);
        if (dose.cbg_mg) parts.push(`CBG ${dose.cbg_mg}mg`);
        if (dose.frequency) parts.push(dose.frequency);
        if (dose.duration) parts.push(dose.duration);
        doseInfo = parts.join(", ");
      }

      // Build tags from category key, cannabinoids, delivery, and key terms
      const tags: string[] = [
        catKey.replace(/_/g, " "),
        ...label.toLowerCase().split(/[\s\/]+/),
        ...(study.cannabinoids ?? []).map((c: string) => c.toLowerCase()),
        ...(study.delivery ?? "").toLowerCase().split(/[\s,()]+/).filter(Boolean),
      ];
      // Add common search terms
      if (catKey.includes("pain")) tags.push("pain", "neuropathic", "chronic", "nociceptive");
      if (catKey.includes("sleep")) tags.push("sleep", "insomnia", "rest");
      if (catKey.includes("anxiety")) tags.push("anxiety", "depression", "mood", "worry");
      if (catKey.includes("nausea")) tags.push("nausea", "vomiting", "cinv", "chemotherapy");
      if (catKey.includes("appetite")) tags.push("appetite", "cachexia", "anorexia", "weight");
      if (catKey.includes("fatigue")) tags.push("fatigue", "energy", "tired");
      if (catKey.includes("headache")) tags.push("headache", "migraine");

      entries.push({
        title: study.title,
        source: study.pmid ? `PubMed PMID: ${study.pmid}` : (study.url ?? "Unknown"),
        year: study.year ?? null,
        pmid: study.pmid ?? null,
        url: study.url ?? null,
        category: label,
        cannabinoids: study.cannabinoids ?? [],
        delivery: study.delivery ?? null,
        outcome: study.outcome ?? null,
        summary: study.summary,
        doseInfo,
        tags: [...new Set(tags)],
      });
    }
  }

  return entries;
}

const CORPUS = buildIndex();

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const input = z.object({
  queryId: z.string(),
  query: z.string(),
  patientId: z.string().optional(),
});

const output = z.object({
  summary: z.string(),
  citations: z.array(
    z.object({
      title: z.string(),
      source: z.string(),
      year: z.number().optional(),
      snippet: z.string(),
    })
  ),
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/**
 * Research Synthesizer Agent v2.1
 * --------------------------------
 * Searches Justin Kander's curated cannabis research corpus (50+ peer-reviewed
 * studies with PMIDs and structured dosing data) then supplements with live
 * PubMed E-utilities results (4 s timeout, fail-open). Corpus hits come first
 * since they carry dose/outcome data; live PubMed fills the remaining slots up
 * to MAX_RESULTS=10 with deduplication by PMID.
 *
 * When OpenRouter is configured, the agent uses the LLM to generate a
 * synthesized summary of the matching studies. Otherwise falls back to a
 * concatenated snippet summary.
 */
export const researchAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: "researchSynthesizer",
  version: "2.1.0",
  description: "Searches the internal cannabis corpus then supplements with live PubMed results.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.research", "read.patient"],
  requiresApproval: false,

  async run({ queryId, query }, ctx) {
    ctx.assertCan("read.research");

    // Tokenize the query
    const tokens = query
      .toLowerCase()
      .split(/[\s,;:+&]+/)
      .filter((t) => t.length > 1);

    // Score each corpus entry by token matches
    const scored = CORPUS.map((entry) => {
      let score = 0;
      const haystack = [
        ...entry.tags,
        entry.title.toLowerCase(),
        entry.summary.toLowerCase(),
        entry.category.toLowerCase(),
        entry.doseInfo.toLowerCase(),
      ].join(" ");

      for (const token of tokens) {
        // Exact tag match = 3 points
        if (entry.tags.includes(token)) score += 3;
        // Title match = 2 points
        if (entry.title.toLowerCase().includes(token)) score += 2;
        // Summary/haystack match = 1 point
        if (haystack.includes(token)) score += 1;
      }

      return { entry, score };
    })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8);

    const corpusHits = scored.map((s) => s.entry);

    ctx.log("info", `Corpus search for "${query}": ${corpusHits.length} hits from ${CORPUS.length} entries`);

    // Supplement with live PubMed — general biomedical search, 4 s timeout.
    // scopeToCannabis:false so non-cannabis practices get useful results too.
    // Fail-open: any network or parse error is swallowed; corpus results
    // are returned as-is.
    // Live hits are normalized to CorpusEntry so the rest of the function
    // (citations build, persist) doesn't need to branch on source type.
    const corpusPmids = new Set(corpusHits.map((h) => h.pmid).filter(Boolean));
    let liveHits: CorpusEntry[] = [];

    try {
      const liveResult = await Promise.race([
        searchPubMed(query, 5, { scopeToCannabis: false }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
      ]);
      if (liveResult) {
        liveHits = liveResult.articles
          .filter((a) => !corpusPmids.has(a.pmid))
          .map((a) => ({
            title: a.title,
            source: `PubMed PMID: ${a.pmid}`,
            year: a.year || null,
            pmid: a.pmid,
            url: a.url,
            category: "PubMed",
            cannabinoids: [],
            delivery: null,
            outcome: null,
            doseInfo: "",
            tags: [],
            summary: a.abstract
              ? a.abstract.slice(0, 400)
              : `Published in ${a.journal}${a.year ? `, ${a.year}` : ""}. Open the PubMed link for the full abstract.`,
          }));
        ctx.log("info", `Live PubMed: ${liveHits.length} new articles for "${query}" (${liveResult.totalResults} total)`);
      }
    } catch {
      // supplemental only — swallow errors
    }

    // Corpus results first (richer dose data); live PubMed fills remaining slots
    const MAX_RESULTS = 10;
    const hits = [...corpusHits.slice(0, MAX_RESULTS), ...liveHits].slice(0, MAX_RESULTS);

    // Build citations
    const citations = hits.map((h) => ({
      title: h.title,
      source: h.pmid ? `PubMed PMID: ${h.pmid}` : (h.url ?? h.source),
      year: h.year ?? undefined,
      snippet: [
        h.summary,
        h.doseInfo ? `Dosing: ${h.doseInfo}.` : "",
        h.outcome ? `Outcome: ${h.outcome}.` : "",
        h.cannabinoids.length > 0 ? `Cannabinoids: ${h.cannabinoids.join(", ")}.` : "",
        h.delivery ? `Delivery: ${h.delivery}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    }));

    // Generate summary — try LLM first, fall back to concatenation
    let summary: string;
    if (hits.length === 0) {
      summary = `No matching studies found for "${query}" in the indexed corpus of ${CORPUS.length} studies or in the live PubMed search. Try broader terms like "pain", "sleep", "anxiety", "nausea", "appetite", "fatigue", or specific cannabinoids like "CBD", "THC".`;
    } else {
      try {
        const studyList = hits
          .map(
            (h, i) =>
              `${i + 1}. ${h.title} (${h.year ?? "n.d."}): ${h.summary}${h.doseInfo ? ` [Dose: ${h.doseInfo}]` : ""}`
          )
          .join("\n");

        const prompt = `Synthesize these ${hits.length} cannabis research studies into a concise clinical summary for a physician. Focus on dosing recommendations and clinical outcomes. Keep it under 200 words.\n\nQuery: "${query}"\n\nStudies:\n${studyList}\n\nWrite a brief, evidence-based synthesis paragraph.`;

        const modelSummary = await ctx.model.complete(prompt, {
          maxTokens: 512,
          temperature: 0.3,
        });

        // If it looks like a real summary (not a stub), use it
        if (modelSummary.length > 50 && !modelSummary.startsWith("[stub")) {
          summary = modelSummary;
        } else {
          throw new Error("Stub response");
        }
      } catch {
        // Fallback: concatenate snippets
        summary = `Found ${hits.length} relevant studies. ${hits.slice(0, 4).map((h) => h.summary).join(" ")}`;
      }
    }

    // Persist results.
    //
    // EMR-668: pass through `pmid` and `url` so the research console can
    // render PubMed article titles as hyperlinks that open the source in a
    // new tab (the page.tsx renderer already reads those fields).
    await prisma.researchResult.deleteMany({ where: { queryId } });
    await prisma.researchResult.createMany({
      data: hits.map((h, idx) => ({
        queryId,
        title: h.title,
        source: citations[idx]?.source ?? h.source,
        year: h.year ?? null,
        summary: citations[idx]?.snippet ?? h.summary,
        citation: citations[idx]?.source ?? h.source,
        url:
          h.url ??
          (h.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${h.pmid}/` : null),
        pmid: h.pmid ?? null,
        rank: idx,
      })),
    });

    await writeAgentAudit(
      "researchSynthesizer",
      "2.1.0",
      null,
      "research.query.answered",
      { type: "ResearchQuery", id: queryId },
      { hitCount: hits.length, corpusHits: corpusHits.length, liveHits: liveHits.length, corpusSize: CORPUS.length }
    );

    ctx.log("info", "Research query answered", { hitCount: hits.length });

    return { summary, citations };
  },
};