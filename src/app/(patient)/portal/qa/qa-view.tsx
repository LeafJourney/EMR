"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import type { QAEntry } from "@/lib/domain/patient-qa";
import {
  searchQA,
  getByCategory,
  CATEGORIES,
  QA_DATABASE,
} from "@/lib/domain/patient-qa";

// ── Category badge tones ────────────────────────────

const CATEGORY_TONES: Record<string, "accent" | "info" | "warning" | "neutral" | "success" | "danger" | "highlight"> = {
  "Getting Started": "accent",
  "Cannabis Basics": "success",
  "Dosing & Safety": "warning",
  "Side Effects": "danger",
  "Legal & Compliance": "info",
  "Your Account": "neutral",
  "Billing & Insurance": "highlight",
  "Appointments": "accent",
  "Prescriptions": "success",
};

// ── Accordion Q&A Card ──────────────────────────────

function QACard({
  entry,
  isOpen,
  onToggle,
  onOpen,
}: {
  entry: QAEntry;
  isOpen: boolean;
  onToggle: () => void;
  onOpen: (id: string) => void;
}) {
  const tone = CATEGORY_TONES[entry.category] || "neutral";

  // Find related questions
  const relatedQuestions = useMemo(() => {
    if (!entry.relatedIds || entry.relatedIds.length === 0) return [];
    return QA_DATABASE.filter((q) => entry.relatedIds?.includes(q.id));
  }, [entry.relatedIds]);

  return (
    <Card
      tone={isOpen ? "raised" : "default"}
      className={cn(
        "transition-all duration-200",
        isOpen ? "shadow-md border-accent/20" : "hover:shadow-sm cursor-pointer"
      )}
    >
      <button
        onClick={onToggle}
        className="w-full text-left px-6 py-4 flex items-start gap-3"
      >
        {/* Expand/collapse indicator */}
        <div className="mt-0.5 shrink-0">
          <svg
            className={cn(
              "h-4 w-4 text-text-muted transition-transform duration-200",
              isOpen && "rotate-90"
            )}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Badge tone={tone} className="text-[10px]">
              {entry.category}
            </Badge>
          </div>
          <h3
            className={cn(
              "text-sm leading-snug",
              isOpen ? "font-medium text-text" : "text-text-muted"
            )}
          >
            {entry.question}
          </h3>
        </div>
      </button>

      {isOpen && (
        <CardContent className="pt-0 pb-5">
          <div className="ml-7">
            {/* Answer */}
            <p className="text-sm text-text leading-relaxed whitespace-pre-line">
              {entry.answer}
            </p>

            {/* Tags */}
            <div className="flex flex-wrap gap-1.5 mt-4">
              {entry.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full bg-surface-muted text-text-subtle border border-border/60"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Related questions */}
            {relatedQuestions.length > 0 && (
              <div className="mt-5 pt-4 border-t border-border/60">
                <p className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-2">
                  Related questions
                </p>
                <div className="space-y-1.5">
                  {relatedQuestions.map((related) => (
                    <button
                      key={related.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        // Open the related question's accordion, then scroll to it.
                        onOpen(related.id);
                        const el = document.getElementById(`qa-${related.id}`);
                        if (el) {
                          el.scrollIntoView({ behavior: "smooth", block: "center" });
                        }
                      }}
                      className="block text-left w-full text-sm text-accent hover:underline"
                    >
                      {related.question}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Main component ──────────────────────────────────

export function QAView() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());

  // Get filtered results
  const results = useMemo(() => {
    if (query.trim()) {
      return searchQA(query);
    }
    if (activeCategory) {
      return getByCategory(activeCategory);
    }
    return QA_DATABASE;
  }, [query, activeCategory]);

  // Group by category when showing all
  const grouped = useMemo(() => {
    if (query.trim() || activeCategory) return null;

    const groups: Record<string, QAEntry[]> = {};
    for (const entry of results) {
      if (!groups[entry.category]) groups[entry.category] = [];
      groups[entry.category].push(entry);
    }
    return groups;
  }, [query, activeCategory, results]);

  const openOne = (id: string) => setOpenIds((prev) => new Set(prev).add(id));

  function toggleOpen(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="space-y-6">
      {/* Search bar */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <svg
            className="h-5 w-5 text-text-subtle"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim()) setActiveCategory(null);
          }}
          placeholder="Search questions, topics, or keywords..."
          className="pl-12 h-12 text-base"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute inset-y-0 right-0 pr-4 flex items-center text-text-subtle hover:text-text"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        )}
      </div>

      {/* Category pills */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => {
            setActiveCategory(null);
            setQuery("");
          }}
          className={cn(
            "inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 whitespace-nowrap",
            !activeCategory && !query
              ? "bg-accent text-accent-ink shadow-sm"
              : "bg-surface-muted/70 text-text-muted hover:bg-surface-muted hover:text-text"
          )}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setActiveCategory(cat);
              setQuery("");
            }}
            className={cn(
              "inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors duration-200 whitespace-nowrap",
              activeCategory === cat
                ? "bg-accent text-accent-ink shadow-sm"
                : "bg-surface-muted/70 text-text-muted hover:bg-surface-muted hover:text-text"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Results count */}
      {query.trim() && (
        <p className="text-sm text-text-muted">
          {results.length} result{results.length !== 1 ? "s" : ""} for &quot;{query}&quot;
        </p>
      )}

      {/* Empty state */}
      {results.length === 0 && (
        <EmptyState
          title="No questions match your search"
          description="Try different keywords or browse by category."
          action={
            <button
              onClick={() => {
                setQuery("");
                setActiveCategory(null);
              }}
              className="text-sm text-accent hover:underline"
            >
              Clear search
            </button>
          }
        />
      )}

      {/* Grouped view (default) */}
      {grouped && (
        <div className="space-y-8">
          {Object.entries(grouped).map(([category, entries]) => (
            <div key={category}>
              <h2 className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-3 ml-1">
                {category}
              </h2>
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div key={entry.id} id={`qa-${entry.id}`}>
                    <QACard
                      entry={entry}
                      isOpen={openIds.has(entry.id)}
                      onToggle={() => toggleOpen(entry.id)}
                      onOpen={openOne}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flat list (search / category filter) */}
      {!grouped && results.length > 0 && (
        <div className="space-y-2">
          {results.map((entry) => (
            <div key={entry.id} id={`qa-${entry.id}`}>
              <QACard
                entry={entry}
                isOpen={openIds.has(entry.id)}
                onToggle={() => toggleOpen(entry.id)}
                onOpen={openOne}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
