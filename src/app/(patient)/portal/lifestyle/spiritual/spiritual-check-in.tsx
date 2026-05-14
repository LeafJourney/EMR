"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  SPIRITUAL_SUBDOMAINS,
  emptyWeek,
  isoWeekKey,
  spiritualScore,
  spiritualStorageKey,
  type SpiritualSubdomain,
  type SpiritualWeekEntry,
} from "@/lib/domain/spiritual-wellness";

interface SpiritualCheckInProps {
  patientId: string;
}

function readWeek(patientId: string, weekKey: string): SpiritualWeekEntry {
  if (typeof window === "undefined") return emptyWeek(weekKey);
  try {
    const raw = window.localStorage.getItem(
      spiritualStorageKey(patientId, weekKey),
    );
    if (!raw) return emptyWeek(weekKey);
    const parsed = JSON.parse(raw) as SpiritualWeekEntry;
    if (parsed.weekKey !== weekKey) return emptyWeek(weekKey);
    return parsed;
  } catch {
    return emptyWeek(weekKey);
  }
}

function writeWeek(patientId: string, entry: SpiritualWeekEntry) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      spiritualStorageKey(patientId, entry.weekKey),
      JSON.stringify(entry),
    );
  } catch {
    // ignore quota errors
  }
}

export function SpiritualCheckIn({ patientId }: SpiritualCheckInProps) {
  const weekKey = useMemo(() => isoWeekKey(), []);
  const [entry, setEntry] = useState<SpiritualWeekEntry>(() => emptyWeek(weekKey));
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setEntry(readWeek(patientId, weekKey));
    setLoaded(true);
  }, [patientId, weekKey]);

  const score = useMemo(() => spiritualScore(entry), [entry]);

  function bump(sub: SpiritualSubdomain, delta: number) {
    setEntry((prev) => {
      const next: SpiritualWeekEntry = {
        ...prev,
        counts: {
          ...prev.counts,
          [sub]: Math.max(0, (prev.counts[sub] ?? 0) + delta),
        },
        updatedAt: new Date().toISOString(),
      };
      writeWeek(patientId, next);
      return next;
    });
  }

  function reset() {
    const fresh = emptyWeek(weekKey);
    writeWeek(patientId, fresh);
    setEntry(fresh);
  }

  return (
    <Card>
      <CardContent className="py-6 md:py-8">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">
              This week · {weekKey}
            </p>
            <p className="font-display text-2xl text-text">
              Spiritual score
            </p>
          </div>
          <div className="text-right">
            <span className="font-display text-4xl md:text-5xl text-accent tabular-nums">
              {loaded ? score : "—"}
            </span>
            <span className="text-xs text-text-subtle ml-1">/ 100</span>
          </div>
        </div>
        <div
          className="h-3 rounded-full bg-surface-muted overflow-hidden mt-3"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={score}
          aria-label="Spiritual pillar score"
        >
          <div
            className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[#C084D8] to-[#7D3F9B]"
            style={{ width: `${Math.max(2, score)}%` }}
          />
        </div>

        <ul className="mt-7 space-y-3">
          {SPIRITUAL_SUBDOMAINS.map((sub) => {
            const count = entry.counts[sub.id] ?? 0;
            const pct = Math.min(100, (count / sub.weeklyTarget) * 100);
            const met = count >= sub.weeklyTarget;
            return (
              <li
                key={sub.id}
                className="rounded-xl border border-border bg-surface-muted/30 p-4"
              >
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl shrink-0" aria-hidden="true">
                    {sub.emoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text">{sub.label}</p>
                    <p className="text-xs text-text-subtle line-clamp-1">
                      {sub.description}
                    </p>
                  </div>
                  {met && (
                    <Badge tone="success" className="text-[10px] shrink-0">
                      target met
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => bump(sub.id, -1)}
                    disabled={count === 0}
                    className="h-9 w-9 rounded-full border border-border-strong text-lg leading-none text-text-muted hover:bg-surface-muted disabled:opacity-30 transition-colors"
                    aria-label={`Subtract one ${sub.label} entry`}
                  >
                    −
                  </button>
                  <div className="flex-1">
                    <div className="flex items-baseline justify-between text-xs text-text-subtle mb-1">
                      <span>
                        <span className="font-display text-lg text-text tabular-nums">
                          {count}
                        </span>{" "}
                        / {sub.weeklyTarget} {sub.unit}
                      </span>
                      <span>{Math.round(pct)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-surface-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-300 bg-accent"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => bump(sub.id, 1)}
                    className="h-9 w-9 rounded-full border border-accent/50 bg-accent-soft/30 text-lg leading-none text-accent hover:bg-accent-soft transition-colors"
                    aria-label={`Add one ${sub.label} entry`}
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="mt-6 flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-text-subtle">
            Saved locally on this device. Your score syncs to the four pillars
            view.
          </p>
          <button
            type="button"
            onClick={reset}
            className="text-xs text-text-subtle hover:text-text underline"
          >
            Reset this week
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
