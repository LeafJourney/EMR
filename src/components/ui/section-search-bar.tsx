"use client";

// MASTER-prompt G8 — the compact "search bar across from each section header"
// that does chronological / parameter filtering of that section's rows. The
// directive frames it as AI-driven (Cindy); under the hood it's the
// deterministic parseSectionQuery() core (honest — no LLM call), so typing
// "last 30 days > 1000 denied" filters by date AND amount AND keyword. Pair it
// with applySectionQuery() in the consuming section.

import { useMemo, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { parseSectionQuery, type SectionQuery } from "@/lib/ui/section-query";

export interface SectionSearchBarProps {
  /** Called with the parsed query on every keystroke. */
  onChange: (query: SectionQuery) => void;
  /** Reference "now" for relative ranges; captured once if omitted. */
  now?: Date;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

export function SectionSearchBar({
  onChange,
  now: nowProp,
  placeholder = "Filter — try “last 30 days” or “> 1000”",
  className,
  "aria-label": ariaLabel = "Filter this section by date, amount, or keyword",
}: SectionSearchBarProps) {
  const [text, setText] = useState("");
  // Stable reference instant so relative windows don't drift each keystroke.
  const [now] = useState(() => nowProp ?? new Date());

  const query = useMemo(() => parseSectionQuery(text, now), [text, now]);

  const update = (value: string) => {
    setText(value);
    onChange(parseSectionQuery(value, now));
  };

  const chips: string[] = [];
  if (query.dateRange) chips.push(query.dateRange.label);
  if (query.amount) chips.push(`${query.amount.op} ${query.amount.value}`);

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <div className="relative w-full sm:w-64">
        <Sparkles
          className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-accent/70"
          aria-hidden="true"
        />
        <Input
          type="text"
          value={text}
          onChange={(e) => update(e.target.value)}
          placeholder={placeholder}
          aria-label={ariaLabel}
          className="h-9 pl-8 pr-8 text-sm"
        />
        {text && (
          <button
            type="button"
            onClick={() => update("")}
            aria-label="Clear section filter"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-text-subtle hover:text-text"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap justify-end gap-1">
          {chips.map((c) => (
            <span
              key={c}
              className="inline-flex items-center rounded-full bg-accent/10 px-2 py-0.5 text-[11px] font-medium text-accent"
            >
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
