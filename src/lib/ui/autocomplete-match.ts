// MASTER-prompt G3 — "every search bar / dropdown / searchable field
// auto-populates the top page-specific matches as you type; site-specific,
// not global." This is the pure ranking core behind <AutocompleteInput>:
// given a page's own option list and the live query, return the best N
// matches (default 7, per the directive). Kept framework-free and
// side-effect-free so it is trivially unit-testable, exactly like the
// table-export core that backs G6.

export interface AutocompleteOption {
  /** Stable value handed back to the consumer on selection. */
  value: string;
  /** Human-readable text shown in the field + list row. */
  label: string;
  /** Optional dimmer second line (e.g. a code, category, or hint). */
  sublabel?: string;
  /** Extra match terms that should surface the option but aren't displayed
   *  (e.g. synonyms, an SKU, a payer id). */
  keywords?: string[];
  /** Rendered but not selectable / skipped by keyboard nav. */
  disabled?: boolean;
}

/** Default match count mandated by the MASTER prompt ("top 7 matches"). */
export const AUTOCOMPLETE_DEFAULT_LIMIT = 7;

// Score tiers — higher is a stronger match. Ordering matters more than the
// exact magnitudes; the gaps are wide so a better placement always wins
// before length/alpha tie-breakers come into play.
const SCORE_EXACT = 1000;
const SCORE_LABEL_PREFIX = 500;
const SCORE_WORD_PREFIX = 300;
const SCORE_LABEL_SUBSTRING = 150;
const SCORE_SUBLABEL_PREFIX = 90;
const SCORE_KEYWORD_PREFIX = 80;
const SCORE_SCATTERED = 40;

const norm = (s: string | undefined): string =>
  (s ?? "").toLowerCase().trim();

// Split on whitespace and common label punctuation so word-boundary prefix
// matching works against codes/paths like "M54.5", "low-back", "A/R aging".
const WORD_SPLIT = /[\s\-/.,()[\]_]+/;

function wordStartsWith(hay: string, needle: string): boolean {
  return hay.split(WORD_SPLIT).some((w) => w.length > 0 && w.startsWith(needle));
}

function haystacks(option: AutocompleteOption): string[] {
  return [
    norm(option.label),
    norm(option.sublabel),
    ...(option.keywords ?? []).map(norm),
  ].filter((h) => h.length > 0);
}

/**
 * Score one option against a normalized, non-empty query.
 * Returns a positive score for a match, or -1 for no match.
 *
 * A multi-word query is an AND: every token must appear somewhere in the
 * option's text (label, sublabel, or a keyword). The headline score comes
 * from how the *whole* query lands in the label (exact ▸ prefix ▸ word-start
 * ▸ substring), with weaker tiers for sublabel/keyword-only and scattered
 * token hits — so "low back" ranks "Low back pain" above a row that merely
 * mentions "back" and "low" in separate keywords.
 */
export function scoreOption(option: AutocompleteOption, query: string): number {
  const q = norm(query);
  if (q === "") return 0;

  const hays = haystacks(option);
  const label = hays[0] ?? "";

  // AND across query tokens — each must land somewhere.
  const tokens = q.split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (!hays.some((h) => h.includes(token))) return -1;
  }

  if (label === q) return SCORE_EXACT;
  if (label.startsWith(q)) return SCORE_LABEL_PREFIX;
  if (wordStartsWith(label, q)) return SCORE_WORD_PREFIX;
  if (label.includes(q)) return SCORE_LABEL_SUBSTRING;

  const rest = hays.slice(1);
  if (rest.some((h) => h.startsWith(q) || wordStartsWith(h, q))) {
    return SCORE_SUBLABEL_PREFIX > SCORE_KEYWORD_PREFIX
      ? SCORE_SUBLABEL_PREFIX
      : SCORE_KEYWORD_PREFIX;
  }
  // Every token matched, but not as one contiguous run anywhere.
  return SCORE_SCATTERED;
}

/**
 * Rank a page's options against the live query and return the top `limit`.
 *
 * Empty query → the first `limit` options verbatim (the "top page-specific
 * defaults" the field shows before the user types), preserving the caller's
 * own ordering. Non-empty query → matches only, sorted by score, then by
 * shorter label (more specific), then alphabetically for a stable order.
 */
export function rankAutocomplete(
  options: readonly AutocompleteOption[],
  query: string,
  limit: number = AUTOCOMPLETE_DEFAULT_LIMIT,
): AutocompleteOption[] {
  const cap = Math.max(0, limit);
  if (norm(query) === "") return options.slice(0, cap);

  const scored = options
    .map((option) => ({ option, score: scoreOption(option, query) }))
    .filter((s) => s.score >= 0);

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const la = a.option.label.length;
    const lb = b.option.label.length;
    if (la !== lb) return la - lb;
    return a.option.label.localeCompare(b.option.label);
  });

  return scored.slice(0, cap).map((s) => s.option);
}
