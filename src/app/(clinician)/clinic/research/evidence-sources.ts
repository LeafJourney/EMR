/**
 * EMR-668 — authoritative external evidence sources surfaced from the
 * /clinic/research "Search the Evidence" multi-source aggregation card.
 *
 * v1 is a static directory: we deep-link to each source's own search/landing
 * page with the clinician's query forwarded. This unblocks the multi-source
 * UX immediately and keeps server work additive — a future ticket can replace
 * `searchUrl` with a server-side fanout into the research-synthesizer agent.
 *
 * Sources are taken verbatim from EMR-668 acceptance criteria. Order is
 * deliberate (UpToDate / Lexicomp first as the highest-utility clinician
 * references) and should not be re-sorted alphabetically without product sign-off.
 */
export type EvidenceSource = {
  id: string;
  label: string;
  /** Short blurb shown under the label. */
  blurb: string;
  /**
   * Build a deep-link to the source's own search UI with the query in tow.
   * Falls back to the source homepage when the source has no public search.
   */
  searchUrl: (query: string) => string;
};

const enc = (q: string) => encodeURIComponent(q.trim());

export const EVIDENCE_SOURCES: EvidenceSource[] = [
  {
    id: "uptodate",
    label: "UpToDate",
    blurb: "Clinician-graded synthesis on diagnosis & treatment.",
    searchUrl: (q) =>
      `https://www.uptodate.com/contents/search?search=${enc(q)}`,
  },
  {
    id: "lexicomp",
    label: "Lexicomp",
    blurb: "Drug interactions & dosing reference (Wolters Kluwer).",
    searchUrl: () => "https://online.lexi.com/lco/action/login",
  },
  {
    id: "open-evidence",
    label: "OpenEvidence",
    blurb: "AI synthesis of peer-reviewed clinical evidence.",
    searchUrl: (q) => `https://www.openevidence.com/?q=${enc(q)}`,
  },
  {
    id: "medlineplus",
    label: "MedlinePlus",
    blurb: "NIH consumer health reference (good for patient handouts).",
    searchUrl: (q) =>
      `https://medlineplus.gov/search.html?query=${enc(q)}`,
  },
  {
    id: "nccih",
    label: "NCCIH",
    blurb: "NIH National Center for Complementary & Integrative Health.",
    searchUrl: (q) =>
      `https://www.nccih.nih.gov/search?keys=${enc(q)}`,
  },
  {
    id: "pubmed",
    label: "PubMed (NCBI)",
    blurb: "Primary biomedical literature index.",
    searchUrl: (q) =>
      `https://pubmed.ncbi.nlm.nih.gov/?term=${enc(q)}`,
  },
  {
    id: "ema",
    label: "EMA",
    blurb: "European Medicines Agency — EU drug approvals & guidance.",
    searchUrl: (q) =>
      `https://www.ema.europa.eu/en/search?search_api_fulltext=${enc(q)}`,
  },
  {
    id: "esmed",
    label: "ESMED",
    blurb: "European Society of Medicine — open-access medical research.",
    searchUrl: () => "https://esmed.org/",
  },
  {
    id: "merck-manuals",
    label: "Merck Manuals (Professional)",
    blurb: "Concise clinician reference for diagnosis & therapy.",
    searchUrl: (q) =>
      `https://www.merckmanuals.com/professional/SearchResults?query=${enc(q)}`,
  },
];
