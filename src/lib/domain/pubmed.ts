// ChatCB Phase 2: PubMed API Integration
// Live search against the National Library of Medicine's E-utilities API.
// Free, no API key required, 3 requests/second rate limit.

export interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  year: number;
  abstract: string;
  doi?: string;
  url: string;
}

export interface PubMedSearchResult {
  query: string;
  totalResults: number;
  articles: PubMedArticle[];
  searchTime: number;
}

const EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";

export interface SearchPubMedOptions {
  /**
   * When true (default), appends a cannabis/cannabinoid AND clause so results
   * stay within the therapeutic-cannabis literature — useful for ChatCB.
   * Set to false for general biomedical search (e.g. the research-agent
   * supplemental lookup which must work for non-cannabis practices too).
   */
  scopeToCannabis?: boolean;
}

/**
 * Search PubMed for articles matching `query`.
 * Uses NCBI E-utilities (free, no API key needed for <3 req/sec).
 */
export async function searchPubMed(
  query: string,
  maxResults: number = 10,
  options: SearchPubMedOptions = {},
): Promise<PubMedSearchResult> {
  const { scopeToCannabis = true } = options;
  const start = Date.now();

  const scopedQuery = scopeToCannabis
    ? `(${query}) AND (cannabis OR cannabinoid OR THC OR CBD OR marijuana OR hemp)`
    : query;

  // Step 1: ESearch — get PMIDs
  const searchUrl = `${EUTILS_BASE}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(scopedQuery)}&retmax=${maxResults}&sort=relevance&retmode=json`;

  let pmids: string[] = [];
  let totalResults = 0;

  try {
    const searchRes = await fetch(searchUrl, { next: { revalidate: 3600 } });
    const searchData = await searchRes.json();
    pmids = searchData?.esearchresult?.idlist ?? [];
    totalResults = parseInt(searchData?.esearchresult?.count ?? "0", 10);
  } catch (err) {
    console.error("[PubMed] ESearch failed:", err);
    return { query, totalResults: 0, articles: [], searchTime: Date.now() - start };
  }

  if (pmids.length === 0) {
    return { query, totalResults: 0, articles: [], searchTime: Date.now() - start };
  }

  // Step 2: ESummary — get article metadata
  const summaryUrl = `${EUTILS_BASE}/esummary.fcgi?db=pubmed&id=${pmids.join(",")}&retmode=json`;

  try {
    const summaryRes = await fetch(summaryUrl, { next: { revalidate: 3600 } });
    const summaryData = await summaryRes.json();
    const results = summaryData?.result ?? {};

    const articles: PubMedArticle[] = pmids
      .filter((id) => results[id])
      .map((id) => {
        const r = results[id];
        const authors = (r.authors ?? [])
          .slice(0, 3)
          .map((a: any) => a.name)
          .join(", ");
        const authorSuffix = (r.authors?.length ?? 0) > 3 ? " et al." : "";
        const doi = (r.elocationid ?? "").replace("doi: ", "");

        return {
          pmid: id,
          title: r.title ?? "Untitled",
          authors: authors + authorSuffix,
          journal: r.fulljournalname ?? r.source ?? "Unknown Journal",
          year: parseInt(r.pubdate?.split(" ")[0] ?? "0", 10),
          abstract: "", // Fetched separately if needed
          doi: doi || undefined,
          url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
        };
      });

    return {
      query,
      totalResults,
      articles,
      searchTime: Date.now() - start,
    };
  } catch (err) {
    console.error("[PubMed] ESummary failed:", err);
    return { query, totalResults, articles: [], searchTime: Date.now() - start };
  }
}

/**
 * Fetch the abstract for a single PubMed article.
 * Uses EFetch with XML parsing (abstracts aren't in ESummary JSON).
 */
export async function fetchAbstract(pmid: string): Promise<string> {
  const url = `${EUTILS_BASE}/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=text`;
  try {
    const res = await fetch(url, { next: { revalidate: 86400 } });
    const text = await res.text();
    // Extract just the abstract portion (after the title/author block)
    const lines = text.split("\n");
    const abstractStart = lines.findIndex((l) => l.trim() === "") + 1;
    const abstractLines = lines.slice(abstractStart).filter((l) => l.trim());
    return abstractLines.join(" ").trim().slice(0, 2000);
  } catch {
    return "";
  }
}

/**
 * Classify a PubMed article's therapeutic stance using simple heuristics.
 * In production, this would use the MCL NLP model.
 */
export function classifyTherapeuticStance(
  title: string,
  abstract: string
): "positive" | "negative" | "neutral" | "mixed" {
  const text = `${title} ${abstract}`.toLowerCase();

  const positiveTerms = ["effective", "beneficial", "improvement", "reduced", "relief", "therapeutic", "promising", "significant reduction", "well-tolerated"];
  const negativeTerms = ["adverse", "risk", "harmful", "no significant", "failed", "ineffective", "dangerous", "contraindicated", "impairment"];
  const mixedTerms = ["mixed results", "inconsistent", "further research", "limited evidence", "conflicting"];

  const posCount = positiveTerms.filter((t) => text.includes(t)).length;
  const negCount = negativeTerms.filter((t) => text.includes(t)).length;
  const mixCount = mixedTerms.filter((t) => text.includes(t)).length;

  if (mixCount > 0 && posCount > 0 && negCount > 0) return "mixed";
  if (posCount > negCount + 1) return "positive";
  if (negCount > posCount + 1) return "negative";
  if (posCount > 0 || negCount > 0) return "mixed";
  return "neutral";
}