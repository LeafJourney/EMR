"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Textarea } from "@/components/ui/input";
import {
  EmptyFilterState,
  FilterChips,
  MultiSelectFilter,
  SavedViewsBar,
  SortMenu,
  type ActiveChip,
} from "@/components/ui/filter-bar";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { cn } from "@/lib/utils/cn";

export type FeedbackStatus = "new" | "in_progress" | "resolved";
export type FeedbackTag = "reviewed" | "action_taken" | "not_actionable";

export interface FeedbackItem {
  id: string;
  patientName: string;
  rating: number; // 0-10 NPS-style
  excerpt: string;
  submittedAt: string;
  status: FeedbackStatus;
  tag?: FeedbackTag;
  responseDraft?: string;
}

const TABS: Array<{ key: "all" | FeedbackStatus; label: string }> = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
];

const TAG_LABELS: Record<FeedbackTag, string> = {
  reviewed: "Reviewed",
  action_taken: "Action taken",
  not_actionable: "Not actionable",
};

type RatingBand = "detractor" | "passive" | "promoter";
const RATING_BAND_LABELS: Record<RatingBand, string> = {
  detractor: "Detractor (0-6)",
  passive: "Passive (7-8)",
  promoter: "Promoter (9-10)",
};

function ratingBand(r: number): RatingBand {
  if (r < 7) return "detractor";
  if (r < 9) return "passive";
  return "promoter";
}

function ratingTone(r: number): "danger" | "warning" | "success" {
  if (r < 7) return "danger";
  if (r < 9) return "warning";
  return "success";
}

type SortKey = "smart" | "newest" | "oldest" | "rating-asc" | "rating-desc";

const SORT_OPTIONS = [
  { value: "smart", label: "Detractors first" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "rating-asc", label: "Rating (low to high)" },
  { value: "rating-desc", label: "Rating (high to low)" },
] as const;

type ViewState = {
  tab: "all" | FeedbackStatus;
  query: string;
  bands: RatingBand[];
  tags: Array<FeedbackTag | "untagged">;
  sort: SortKey;
};

const DEFAULT_STATE: ViewState = {
  tab: "all",
  query: "",
  bands: [],
  tags: [],
  sort: "smart",
};

export function FeedbackView({ initialFeedback }: { initialFeedback: FeedbackItem[] }) {
  const [items, setItems] = useState<FeedbackItem[]>(initialFeedback);
  const [state, setState] = useState<ViewState>(DEFAULT_STATE);
  const [responding, setResponding] = useState<FeedbackItem | null>(null);
  const [responseText, setResponseText] = useState("");

  const sorted = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    const filtered = items.filter((i) => {
      if (state.tab !== "all" && i.status !== state.tab) return false;
      if (state.bands.length > 0 && !state.bands.includes(ratingBand(i.rating))) {
        return false;
      }
      if (state.tags.length > 0) {
        const tagKey: FeedbackTag | "untagged" = i.tag ?? "untagged";
        if (!state.tags.includes(tagKey)) return false;
      }
      if (q) {
        const hay = `${i.patientName} ${i.excerpt}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    return [...filtered].sort((a, b) => {
      switch (state.sort) {
        case "smart": {
          const aNeg = a.rating < 7 ? 0 : 1;
          const bNeg = b.rating < 7 ? 0 : 1;
          if (aNeg !== bNeg) return aNeg - bNeg;
          return b.submittedAt.localeCompare(a.submittedAt);
        }
        case "newest":
          return b.submittedAt.localeCompare(a.submittedAt);
        case "oldest":
          return a.submittedAt.localeCompare(b.submittedAt);
        case "rating-asc":
          return a.rating - b.rating;
        case "rating-desc":
          return b.rating - a.rating;
      }
    });
  }, [items, state]);

  const chips: ActiveChip[] = [];
  if (state.tab !== "all") {
    chips.push({
      id: "tab",
      label: "Status",
      value: TABS.find((t) => t.key === state.tab)?.label ?? state.tab,
    });
  }
  if (state.query.trim()) {
    chips.push({ id: "query", label: "Search", value: state.query.trim() });
  }
  if (state.bands.length > 0) {
    chips.push({
      id: "bands",
      label: "NPS",
      value: state.bands.map((b) => RATING_BAND_LABELS[b]),
    });
  }
  if (state.tags.length > 0) {
    chips.push({
      id: "tags",
      label: "Tag",
      value: state.tags.map((t) => (t === "untagged" ? "Untagged" : TAG_LABELS[t])),
    });
  }

  function removeChip(id: string) {
    setState((s) => {
      switch (id) {
        case "tab":
          return { ...s, tab: "all" };
        case "query":
          return { ...s, query: "" };
        case "bands":
          return { ...s, bands: [] };
        case "tags":
          return { ...s, tags: [] };
        default:
          return s;
      }
    });
  }

  function clearAll() {
    setState({ ...DEFAULT_STATE, sort: state.sort });
  }

  function isDefault(s: ViewState) {
    return (
      s.tab === "all" &&
      s.query === "" &&
      s.bands.length === 0 &&
      s.tags.length === 0 &&
      s.sort === DEFAULT_STATE.sort
    );
  }

  function draftReply(f: FeedbackItem) {
    const template =
      f.rating < 7
        ? `Hi ${f.patientName === "Anonymous" ? "there" : f.patientName.split(" ")[0]},\n\nThank you for sharing this — I'm sorry to hear the experience fell short. I'd like to understand what happened and make it right. Could we schedule a quick call this week?\n\n— Leafjourney Care Team`
        : `Hi ${f.patientName === "Anonymous" ? "there" : f.patientName.split(" ")[0]},\n\nThank you so much for this kind note! It means a lot to the whole team. Please keep telling us what's working so we can do more of it.\n\n— Leafjourney Care Team`;
    setResponding(f);
    setResponseText(template);
  }

  function saveResponse() {
    if (!responding) return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === responding.id
          ? { ...i, responseDraft: responseText, status: i.status === "new" ? "in_progress" : i.status }
          : i,
      ),
    );
    setResponding(null);
    setResponseText("");
  }

  function setTag(id: string, tag: FeedbackTag) {
    setItems((prev) =>
      prev.map((i) =>
        i.id === id
          ? {
              ...i,
              tag,
              status: tag === "action_taken" || tag === "not_actionable" ? "resolved" : i.status,
            }
          : i,
      ),
    );
  }

  return (
    <div className="space-y-5">
      <SavedViewsBar
        storageKey="ops.feedback"
        currentState={state}
        isDefault={isDefault}
        onApply={(s) => setState(s)}
        onReset={() => setState(DEFAULT_STATE)}
      />

      <div className="flex items-center gap-2 flex-wrap">
        {TABS.map((t) => {
          const count = t.key === "all" ? items.length : items.filter((i) => i.status === t.key).length;
          const active = state.tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setState((s) => ({ ...s, tab: t.key }))}
              className={cn(
                "h-9 px-3.5 rounded-full text-xs font-medium border transition-colors",
                active
                  ? "bg-emerald-700 text-white border-emerald-700"
                  : "bg-surface text-text-muted border-border hover:bg-surface-muted",
              )}
            >
              {t.label}
              <span className={cn("ml-2 tabular-nums", active ? "text-white/80" : "text-text-subtle")}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          placeholder="Search by name or excerpt…"
          value={state.query}
          onChange={(e) => setState((s) => ({ ...s, query: e.target.value }))}
          className="md:w-64 h-9"
        />
        <MultiSelectFilter
          label="NPS band"
          options={(["detractor", "passive", "promoter"] as RatingBand[]).map((b) => ({
            value: b,
            label: RATING_BAND_LABELS[b],
          }))}
          selected={state.bands}
          onChange={(next) => setState((s) => ({ ...s, bands: next as RatingBand[] }))}
          placeholder="All bands"
        />
        <MultiSelectFilter
          label="Tag"
          options={[
            { value: "untagged", label: "Untagged" },
            { value: "reviewed", label: TAG_LABELS.reviewed },
            { value: "action_taken", label: TAG_LABELS.action_taken },
            { value: "not_actionable", label: TAG_LABELS.not_actionable },
          ]}
          selected={state.tags}
          onChange={(next) =>
            setState((s) => ({ ...s, tags: next as Array<FeedbackTag | "untagged"> }))
          }
          placeholder="Any tag"
        />
        <SortMenu
          options={[...SORT_OPTIONS]}
          value={state.sort}
          onChange={(next) => setState((s) => ({ ...s, sort: next as SortKey }))}
        />
      </div>

      <FilterChips chips={chips} onRemove={removeChip} onClearAll={clearAll} />

      {sorted.length === 0 ? (
        <EmptyFilterState
          title="No feedback matches"
          hint="Try widening the NPS band or clearing the tag filter."
          onClear={clearAll}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {sorted.map((f) => {
            const isNegative = f.rating < 7;
            return (
              <Card
                key={f.id}
                tone="raised"
                className={cn(isNegative && "border-red-300/70 ring-1 ring-red-200")}
              >
                <CardContent className="py-5 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-text">{f.patientName}</p>
                      <p className="text-[11px] text-text-subtle">
                        {new Date(f.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge tone={ratingTone(f.rating)}>NPS {f.rating}/10</Badge>
                  </div>
                  <p className="text-sm text-text-muted">&ldquo;{f.excerpt}&rdquo;</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge tone={f.status === "resolved" ? "success" : f.status === "in_progress" ? "warning" : "neutral"}>
                      {f.status.replace("_", " ")}
                    </Badge>
                    {f.tag && <Badge tone="accent">{TAG_LABELS[f.tag]}</Badge>}
                  </div>
                  <div className="flex items-center gap-2 pt-2 border-t border-border/60 flex-wrap">
                    <Button size="sm" variant="secondary" onClick={() => draftReply(f)}>
                      Respond
                    </Button>
                    <select
                      value={f.tag ?? ""}
                      onChange={(e) => {
                        const val = e.target.value as FeedbackTag | "";
                        if (val) setTag(f.id, val);
                      }}
                      className="rounded-md border border-border-strong bg-surface px-2 h-9 text-xs text-text-muted"
                    >
                      <option value="">Tag…</option>
                      <option value="reviewed">Reviewed</option>
                      <option value="action_taken">Action taken</option>
                      <option value="not_actionable">Not actionable</option>
                    </select>
                  </div>
                  {f.responseDraft && (
                    <details className="mt-1">
                      <summary className="text-[11px] text-text-subtle cursor-pointer">
                        Draft reply saved
                      </summary>
                      <LinkifiedText
                        as="p"
                        className="mt-2 text-xs text-text-muted whitespace-pre-line"
                        text={f.responseDraft}
                      />
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {responding && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setResponding(null)}
        >
          <Card tone="raised" className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-subtle mb-1">Respond</p>
                <h3 className="font-display text-lg text-text">{responding.patientName}</h3>
                <p className="text-xs text-text-muted mt-1">NPS {responding.rating}/10</p>
              </div>
              <Textarea
                rows={8}
                value={responseText}
                onChange={(e) => setResponseText(e.target.value)}
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setResponding(null)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={saveResponse}>
                  Save draft
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
