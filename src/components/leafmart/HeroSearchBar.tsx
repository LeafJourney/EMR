"use client";

// EMR-281 — Amazon-style search bar with autocomplete for the Leafmart
// homepage hero. Suggests across multiple axes:
//   - products (name + brand)
//   - symptoms / use-cases
//   - cannabinoid names (THC, CBD, CBG, CBN, THCv, etc.)
//   - terpene names (myrcene, limonene, pinene, etc.)
//   - strain types (indica / sativa / hybrid)
//   - delivery formats (tincture, edible, topical, etc.)
//
// On selection or Enter, navigates to /leafmart/search?q=<term>. The
// search page already supports the same q parameter and filter set,
// so this component is purely a discovery accelerator.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export type SuggestionKind =
  | "product"
  | "symptom"
  | "cannabinoid"
  | "terpene"
  | "strain"
  | "format"
  | "accessory";

export interface Suggestion {
  kind: SuggestionKind;
  label: string;
  /** Optional secondary line shown faintly under the label. */
  detail?: string;
  /** Optional href override. Defaults to /leafmart/search?q=<label>. */
  href?: string;
}

export interface HeroSearchBarProps {
  /** Pre-built suggestion universe. Resolved server-side from the catalog. */
  suggestions: Suggestion[];
  /** How many suggestions to show in the dropdown. */
  limit?: number;
  placeholder?: string;
  className?: string;
}

const KIND_LABEL: Record<SuggestionKind, string> = {
  product: "Product",
  symptom: "Symptom",
  cannabinoid: "Cannabinoid",
  terpene: "Terpene",
  strain: "Strain",
  format: "Format",
  accessory: "Accessory",
};

const KIND_TONE: Record<SuggestionKind, string> = {
  product: "bg-[var(--leaf)]/10 text-[var(--leaf)]",
  symptom: "bg-amber-100 text-amber-800",
  cannabinoid: "bg-emerald-100 text-emerald-800",
  terpene: "bg-sky-100 text-sky-800",
  strain: "bg-violet-100 text-violet-800",
  format: "bg-rose-100 text-rose-800",
  accessory: "bg-stone-100 text-stone-800",
};

function rankSuggestions(query: string, pool: Suggestion[], limit: number): Suggestion[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { s: Suggestion; score: number }[] = [];
  for (const s of pool) {
    const label = s.label.toLowerCase();
    const detail = (s.detail ?? "").toLowerCase();
    let score = 0;
    if (label === q) score += 100;
    else if (label.startsWith(q)) score += 40;
    else if (label.includes(q)) score += 20;
    if (detail.includes(q)) score += 5;
    // Boost products slightly so the first results are clickable items, not taxonomies.
    if (s.kind === "product" && score > 0) score += 3;
    if (score > 0) scored.push({ s, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map((x) => x.s);
}

export function HeroSearchBar({
  suggestions,
  limit = 8,
  placeholder = "Search products, symptoms, cannabinoids, terpenes…",
  className,
}: HeroSearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(
    () => rankSuggestions(query, suggestions, limit),
    [query, suggestions, limit],
  );

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [open]);

  const navigate = (term: string, href?: string) => {
    if (href) {
      router.push(href);
      return;
    }
    const q = term.trim();
    if (!q) return;
    router.push(`/leafmart/search?q=${encodeURIComponent(q)}`);
  };

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(h + 1, matches.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = matches[highlight];
      if (target) navigate(target.label, target.href);
      else navigate(query);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={`relative w-full max-w-2xl ${className ?? ""}`}>
      <div className="relative">
        <span
          aria-hidden="true"
          className="absolute left-5 top-1/2 -translate-y-1/2 text-[var(--leaf)] pointer-events-none"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
            <path d="M13.7 13.7L17 17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setOpen(e.target.value.trim().length > 0);
          }}
          onFocus={() => {
            if (query.trim().length > 0) setOpen(true);
          }}
          onKeyDown={handleKey}
          placeholder={placeholder}
          aria-label="Search Leafmart"
          // `role="combobox"` is required for `aria-expanded` and
          // `aria-autocomplete` to be valid on an input. Without it,
          // axe-core (and lint's `jsx-a11y/role-supports-aria-props`)
          // flag the implicit `textbox` role as not supporting these
          // attributes. The combobox pattern is the correct semantic
          // for a search input that opens a suggestion listbox.
          // (EMR-713)
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          autoComplete="off"
          className="w-full h-14 pl-14 pr-32 rounded-full bg-white text-[var(--ink)] placeholder:text-[var(--text-subtle)] border border-[var(--border)] focus:outline-none focus:border-[var(--leaf)] focus:ring-2 focus:ring-[var(--leaf)]/20 shadow-sm transition-colors"
        />
        <button
          type="button"
          onClick={() => navigate(query)}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center px-5 h-11 rounded-full bg-[var(--ink)] text-[var(--bg,#fff)] text-sm font-medium hover:bg-[var(--leaf)] transition-colors"
        >
          Search
        </button>
      </div>

      {open && matches.length > 0 && (
        <ul
          role="listbox"
          aria-label="Search suggestions"
          className="absolute z-30 mt-2 w-full max-h-[420px] overflow-y-auto rounded-2xl bg-white border border-[var(--border)] shadow-xl divide-y divide-[var(--border)]"
        >
          {matches.map((s, i) => {
            const isActive = i === highlight;
            return (
              <li key={`${s.kind}:${s.label}`} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  onMouseEnter={() => setHighlight(i)}
                  onClick={() => navigate(s.label, s.href)}
                  className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left transition-colors ${
                    isActive ? "bg-[var(--surface-muted)]" : "hover:bg-[var(--surface-muted)]/60"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-[14px] font-medium text-[var(--ink)] truncate">
                      {s.label}
                    </div>
                    {s.detail && (
                      <div className="text-[12px] text-[var(--text-subtle)] truncate">{s.detail}</div>
                    )}
                  </div>
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${KIND_TONE[s.kind]}`}
                  >
                    {KIND_LABEL[s.kind]}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {open && matches.length === 0 && query.trim().length > 0 && (
        <div className="absolute z-30 mt-2 w-full rounded-2xl bg-white border border-[var(--border)] shadow-xl px-4 py-6 text-center">
          <p className="text-sm text-[var(--text-soft)]">
            Nothing matches &ldquo;<span className="font-medium text-[var(--ink)]">{query}</span>&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => navigate(query)}
            className="mt-2 text-[13px] font-medium text-[var(--leaf)] hover:underline"
          >
            Search anyway →
          </button>
        </div>
      )}
    </div>
  );
}

export default HeroSearchBar;
