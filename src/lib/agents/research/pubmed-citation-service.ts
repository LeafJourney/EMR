// ChatCB Phase 2 — Live PubMed citation service.
// Bridges the raw NCBI E-utilities client (`@/lib/domain/pubmed`) to the
// `Citation` shape consumed by ChatCB. Adds heuristic study-type inference,
// abstract enrichment with bounded concurrency, and graceful fallback on
// network failure so the chat surface never blocks on a slow PubMed call.

import {
  searchPubMed,
  fetchAbstract,
  classifyTherapeuticStance,
  type PubMedArticle,
} from "@/lib/domain/pubmed";
import type { Citation, StudyType, EvidenceLevel } from "@/lib/domain/chatcb";
import { logger } from "@/lib/observability/log";

export interface FetchCitationsOptions {
  /** Max number of PubMed records to return. Defaults to 5. */
  maxResults?: number;
  /**
   * If true, fetches the abstract for each article via EFetch. Slower but
   * yields richer summaries and more accurate evidence-level classification.
   * Defaults to true.
   */
  includeAbstracts?: boolean;
  /**
   * Per-abstract fetch timeout in ms. After timeout, the citation is
   * returned with an empty abstract instead of blocking the response.
   * Defaults to 3000.
   */
  abstractTimeoutMs?: number;
}

export interface PubMedCitationsResult {
  query: string;
  totalResults: number;
  citations: Citation[];
  searchTime: number;
}

/**
 * Fetch live PubMed articles matching `query` and convert them to ChatCB
 * `Citation` records. Errors are caught and surfaced as an empty result so
 * the caller (ChatCB chat surface) can degrade gracefully to its static
 * knowledge base.
 */
export async function fetchPubMedCitations(
  query: string,
  options: FetchCitationsOptions = {},
): Promise<PubMedCitationsResult> {
  const {
    maxResults = 5,
    includeAbstracts = true,
    abstractTimeoutMs = 3000,
  } = options;

  const trimmed = query.trim();
  if (!trimmed) {
    return { query: trimmed, totalResults: 0, citations: [], searchTime: 0 };
  }

  let searchResult;
  try {
    searchResult = await searchPubMed(trimmed, maxResults);
  } catch (err) {
    logger.error({ event: "agent.pubmed.search_failed", query: trimmed, err });
    return { query: trimmed, totalResults: 0, citations: [], searchTime: 0 };
  }

  if (searchResult.articles.length === 0) {
    return {
      query: trimmed,
      totalResults: searchResult.totalResults,
      citations: [],
      searchTime: searchResult.searchTime,
    };
  }

  const enriched = includeAbstracts
    ? await Promise.all(
        searchResult.articles.map((article) =>
          enrichWithAbstract(article, abstractTimeoutMs),
        ),
      )
    : searchResult.articles;

  const citations = enriched.map(articleToCitation);

  return {
    query: trimmed,
    totalResults: searchResult.totalResults,
    citations,
    searchTime: searchResult.searchTime,
  };
}

async function enrichWithAbstract(
  article: PubMedArticle,
  timeoutMs: number,
): Promise<PubMedArticle> {
  try {
    const abstract = await Promise.race([
      fetchAbstract(article.pmid),
      new Promise<string>((resolve) => setTimeout(() => resolve(""), timeoutMs)),
    ]);
    return { ...article, abstract };
  } catch {
    return article;
  }
}

function articleToCitation(article: PubMedArticle): Citation {
  const stance: EvidenceLevel = article.abstract
    ? classifyTherapeuticStance(article.title, article.abstract)
    : "insufficient";

  const summary = article.abstract
    ? truncate(article.abstract, 320)
    : `Published in ${article.journal}${article.year ? `, ${article.year}` : ""}. Open the PubMed link for the full abstract.`;

  return {
    id: `pubmed-${article.pmid}`,
    title: article.title,
    authors: article.authors || "Unknown authors",
    journal: article.journal,
    year: article.year || new Date().getFullYear(),
    pmid: article.pmid,
    doi: article.doi,
    evidenceLevel: stance,
    studyType: inferStudyType(article.title, article.abstract),
    summary,
  };
}

/**
 * Heuristic study-type inference from title + abstract. Cheap pattern match
 * that catches the common cases; the MCL NLP classifier could replace this
 * later for higher accuracy.
 */
export function inferStudyType(title: string, abstract: string = ""): StudyType {
  const text = `${title} ${abstract}`.toLowerCase();

  if (text.includes("meta-analysis") || text.includes("meta analysis")) {
    return "meta_analysis";
  }
  if (text.includes("systematic review")) return "systematic_review";
  if (
    text.includes("randomized controlled trial") ||
    text.includes("randomised controlled trial") ||
    text.includes("double-blind") ||
    text.includes("placebo-controlled") ||
    text.includes("clinical trial") ||
    /\brct\b/.test(text)
  ) {
    return "clinical_trial";
  }
  if (text.includes("case report") || text.includes("case series")) {
    return "case_report";
  }
  if (
    text.includes("cohort study") ||
    text.includes("retrospective") ||
    text.includes("prospective study") ||
    text.includes("cross-sectional") ||
    text.includes("observational")
  ) {
    return "observational";
  }
  if (
    text.includes("in vitro") ||
    text.includes("in vivo") ||
    text.includes("preclinical") ||
    /\b(mouse|mice|rat|rats|murine|rodent)\b/.test(text)
  ) {
    return "preclinical";
  }
  if (text.includes("review")) return "review";
  return "review";
}

function truncate(text: string, max: number): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max).trimEnd()}…`;
}
