"use client";

// Wellness toolkit checkbox dropdown — EMR-191 + EMR-19 + plant-growth wiring (EMR-072)
//
// EMR-19 redesign: the colored left-border "ribbon" on each card was
// distracting and clashed with the rest of the wellness hub. It's gone,
// replaced with a single tonal accent (a small dot beside the domain
// icon). The checkboxes now feed a visible wellness score so the
// patient can see their effort move the number — score lives at the
// top of the toolkit, weighted by difficulty (easy=1, moderate=2,
// challenging=3).
//
// EMR-072: Every check feeds a plant-growth event log that powers the
// "Your growth" preview below — leaves, stems, and flowers. The growth math
// lives in `@/lib/domain/lifestyle-growth` so it's unit-tested independently.

import { useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { confettiEmitter } from "@/components/portal/confetti-canvas";
import type { LifestyleDomain, LifestyleTip } from "@/lib/domain/lifestyle";
import {
  computeLifestyleGrowth,
  type LifestyleCheckEvent,
  LEAF_CAP,
  STEM_CAP,
  FLOWER_STREAK_DAYS,
} from "@/lib/domain/lifestyle-growth";

const STORAGE_KEY = "lj-lifestyle-checked";
const EVENTS_STORAGE_KEY = "lj-lifestyle-check-events";
// EMR-072/176 — once the plant blooms we celebrate exactly once, then
// remember it so re-renders / revisits don't re-fire the confetti.
const BLOOM_CELEBRATED_KEY = "lj-lifestyle-bloom-celebrated";
const EVENT_RETENTION_DAYS = FLOWER_STREAK_DAYS + 7;

const DIFFICULTY_TONE: Record<
  LifestyleTip["difficulty"],
  "success" | "warning" | "danger"
> = {
  easy: "success",
  moderate: "warning",
  challenging: "danger",
};

// EMR-19 — difficulty-weighted scoring. Encourages tackling harder items
// without making easy ones feel pointless.
const DIFFICULTY_WEIGHT: Record<LifestyleTip["difficulty"], number> = {
  easy: 1,
  moderate: 2,
  challenging: 3,
};

function scoreColor(score: number): string {
  if (score >= 75) return "text-emerald-600";
  if (score >= 50) return "text-amber-600";
  if (score >= 25) return "text-orange-600";
  return "text-text-subtle";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Thriving";
  if (score >= 75) return "Strong";
  if (score >= 50) return "Steady";
  if (score >= 25) return "Building";
  return "Getting started";
}

interface ToolkitProps {
  domains: LifestyleDomain[];
  tips: Record<string, LifestyleTip[]>;
}

function readChecked(): Record<string, true> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeChecked(state: Record<string, true>) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota / private mode
  }
}

function readEvents(): LifestyleCheckEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    return parsed.filter(
      (e): e is LifestyleCheckEvent =>
        typeof e?.tipKey === "string" &&
        typeof e?.domainId === "string" &&
        typeof e?.checkedAt === "string" &&
        new Date(e.checkedAt).getTime() > cutoff,
    );
  } catch {
    return [];
  }
}

function writeEvents(events: LifestyleCheckEvent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EVENTS_STORAGE_KEY, JSON.stringify(events));
  } catch {
    // ignore quota
  }
}

function tipKey(domainId: string, tipTitle: string): string {
  return `${domainId}::${tipTitle}`;
}

export function LifestyleToolkit({ domains, tips }: ToolkitProps) {
  const [checked, setChecked] = useState<Record<string, true>>({});
  const [events, setEvents] = useState<LifestyleCheckEvent[]>([]);
  const [openDomain, setOpenDomain] = useState<string | null>(domains[0]?.id ?? null);

  useEffect(() => {
    setChecked(readChecked());
    setEvents(readEvents());
  }, []);

  const total = useMemo(
    () => Object.values(tips).reduce((sum, arr) => sum + arr.length, 0),
    [tips],
  );
  const checkedCount = Object.keys(checked).length;

  // EMR-19 — difficulty-weighted wellness score (0–100). Each tip
  // contributes its weight if checked; we normalize against the total
  // available weight so the score is comparable across patients.
  const wellnessScore = useMemo(() => {
    let earned = 0;
    let possible = 0;
    for (const domain of domains) {
      const domainTips = tips[domain.id] ?? [];
      for (const tip of domainTips) {
        const w = DIFFICULTY_WEIGHT[tip.difficulty];
        possible += w;
        if (checked[tipKey(domain.id, tip.title)]) earned += w;
      }
    }
    if (possible === 0) return 0;
    return Math.round((earned / possible) * 100);
  }, [checked, domains, tips]);

  const growth = useMemo(
    () =>
      computeLifestyleGrowth({
        events,
        categories: domains.map((d) => d.id),
      }),
    [events, domains],
  );

  // EMR-072/176 — fire the (already-mounted) confetti bus the first time the
  // patient's plant comes into bloom. Guarded by localStorage so it only
  // celebrates the milestone once, not on every visit.
  const bloomCelebrated = useRef(false);
  useEffect(() => {
    if (!growth.hasFlowers || bloomCelebrated.current) return;
    let alreadyCelebrated = false;
    try {
      alreadyCelebrated =
        window.localStorage.getItem(BLOOM_CELEBRATED_KEY) === "1";
    } catch {
      /* ignore */
    }
    if (alreadyCelebrated) {
      bloomCelebrated.current = true;
      return;
    }
    bloomCelebrated.current = true;
    try {
      window.localStorage.setItem(BLOOM_CELEBRATED_KEY, "1");
    } catch {
      /* ignore */
    }
    confettiEmitter.emit({
      id: "lifestyle-bloom",
      type: "streak_milestone",
      message: "Your plant is in bloom! 🌸",
    });
  }, [growth.hasFlowers]);

  function toggle(key: string, domainId: string) {
    setChecked((prev) => {
      const next = { ...prev };
      const wasChecked = !!next[key];
      if (wasChecked) delete next[key];
      else next[key] = true;
      writeChecked(next);

      // Append a check event only on the toggle-ON edge — un-checking does
      // not retract a growth event the patient already earned today.
      if (!wasChecked) {
        setEvents((evs) => {
          const updated = [
            ...evs,
            { tipKey: key, domainId, checkedAt: new Date().toISOString() },
          ];
          writeEvents(updated);
          return updated;
        });
      }
      return next;
    });
  }

  return (
    <section>
      {/* EMR-19 — wellness score header replaces the ribbon-styled card.
           Score is the load-bearing visual cue; the active count is
           secondary. */}
      <div className="mb-5 rounded-2xl bg-surface border border-border/60 p-5 sm:p-6 flex items-center gap-5">
        <div className="relative shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
            <circle
              cx="36"
              cy="36"
              r="30"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-surface-muted"
            />
            <circle
              cx="36"
              cy="36"
              r="30"
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeDasharray={2 * Math.PI * 30}
              strokeDashoffset={2 * Math.PI * 30 * (1 - wellnessScore / 100)}
              strokeLinecap="round"
              transform="rotate(-90 36 36)"
              className={`transition-[stroke-dashoffset] duration-500 ${scoreColor(wellnessScore)}`}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className={`font-display text-xl tabular-nums ${scoreColor(wellnessScore)}`}>
              {wellnessScore}
            </span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
            Wellness score
          </p>
          <p className="font-display text-xl text-text tracking-tight">
            {scoreLabel(wellnessScore)}
          </p>
          <p className="text-xs text-text-muted mt-0.5">
            {checkedCount} of {total} active · weighted by difficulty
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h2 className="font-display text-2xl text-text tracking-tight">
          Pick what you are working on
        </h2>
        <Badge tone="neutral">
          {checkedCount}/{total} active
        </Badge>
      </div>

      {/* EMR-072: plant growth preview */}
      <Card tone="raised" className="mb-5">
        <CardContent className="py-4">
          <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-sm text-text">Your growth</span>
              <span className="text-[11px] text-text-subtle">
                · every check grows a leaf, full days grow a stem
              </span>
            </div>
            {growth.hasFlowers && (
              <Badge tone="success" className="text-[10px]">
                in bloom 🌸
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <GrowthStat
              emoji="\u{1F343}"
              label="Leaves"
              value={growth.leafCount}
              cap={LEAF_CAP}
            />
            <GrowthStat
              emoji="\u{1F33F}"
              label="Stems"
              value={growth.stemCount}
              cap={STEM_CAP}
            />
            <GrowthStat
              emoji="\u{1F525}"
              label="Day streak"
              value={growth.streakDays}
              cap={FLOWER_STREAK_DAYS}
            />
          </div>
          <p className="text-xs text-text-muted mt-3 leading-relaxed text-center">
            {growth.nextNudge}
          </p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {domains.map((domain) => {
          const isOpen = openDomain === domain.id;
          const domainTips = tips[domain.id] ?? [];
          const activeInDomain = domainTips.filter(
            (t) => checked[tipKey(domain.id, t.title)],
          ).length;

          return (
            <Card
              key={domain.id}
              tone="raised"
              className="overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenDomain(isOpen ? null : domain.id)}
                aria-expanded={isOpen}
                className="w-full text-left px-5 py-4 flex items-center gap-3 hover:bg-surface-muted/40 transition-colors"
              >
                {/* EMR-19 — domain color survives as a small dot in place of
                     the old left-border ribbon. */}
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl relative"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${domain.color} 12%, transparent)`,
                  }}
                  aria-hidden="true"
                >
                  {domain.icon}
                  <span
                    className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-surface"
                    style={{ backgroundColor: domain.color }}
                  />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-text">{domain.label}</p>
                  <p className="text-xs text-text-subtle mt-0.5 line-clamp-1">
                    {domain.description}
                  </p>
                </div>
                {activeInDomain > 0 && (
                  <Badge tone="accent" className="text-[10px]">
                    {activeInDomain} active
                  </Badge>
                )}
                <span
                  className={`text-text-subtle text-xs transition-transform ${
                    isOpen ? "rotate-90" : ""
                  }`}
                  aria-hidden="true"
                >
                  {"▶"}
                </span>
              </button>

              {isOpen && (
                <CardContent className="pt-1 pb-4 border-t border-border/50">
                  <ul className="divide-y divide-border/50">
                    {domainTips.map((tip) => {
                      const key = tipKey(domain.id, tip.title);
                      const on = !!checked[key];
                      return (
                        <li key={tip.title} className="py-3">
                          <label className="flex items-start gap-3 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggle(key, domain.id)}
                              className="mt-1 h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/40"
                            />
                            <span className="flex-1 min-w-0">
                              <span className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-sm ${
                                    on
                                      ? "text-text font-medium"
                                      : "text-text"
                                  }`}
                                >
                                  {tip.title}
                                </span>
                                <Badge
                                  tone={DIFFICULTY_TONE[tip.difficulty]}
                                  className="text-[10px]"
                                >
                                  {tip.difficulty}
                                </Badge>
                                {tip.timeCommitment !== "0 min" && (
                                  <span className="text-[11px] text-text-subtle">
                                    {tip.timeCommitment}
                                  </span>
                                )}
                              </span>
                              <span className="block text-sm text-text-muted leading-relaxed mt-1">
                                {tip.body}
                              </span>
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function GrowthStat({
  emoji,
  label,
  value,
  cap,
}: {
  emoji: string;
  label: string;
  value: number;
  cap: number;
}) {
  const pct = cap === 0 ? 0 : Math.min(100, (value / cap) * 100);
  return (
    <div>
      <span className="text-2xl block" aria-hidden="true">
        {emoji}
      </span>
      <p className="font-display text-2xl text-text tabular-nums">
        {value}
        <span className="text-xs text-text-subtle ml-1">/ {cap}</span>
      </p>
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle mt-0.5">
        {label}
      </p>
      <div
        className="h-1 rounded-full bg-surface-muted overflow-hidden mt-1.5"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={cap}
        aria-valuenow={value}
        aria-label={`${label} progress`}
      >
        <div
          className="h-full rounded-full bg-accent transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
