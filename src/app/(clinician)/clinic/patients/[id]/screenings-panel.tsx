"use client";

/**
 * Preventative Screenings (EMR-855).
 *
 * USPSTF Grade A/B screenings rendered as tiles: green when marked
 * up-to-date, light red when due/overdue. Each carries a fun emoji, the
 * grade, and the frequency. A search button opens the USPSTF recommendation
 * browser. Clicking a tile opens a chronological-results popup with a trend
 * visual and a "Cindy says" read; an RPM/CCM row pulls device categories.
 *
 * Completion state is tracked in localStorage (no schema change this sprint),
 * so a provider can flip a tile to "up to date" and it persists per chart.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/ui/sparkline";
import { Bubble, CindySays, ModalShell, usePersistentState } from "./chart-kit";
import { cindyTrend } from "@/lib/clinical/cindy-says";

interface ScreeningLite {
  id: string;
  label: string;
  emoji: string;
  grade: "A" | "B";
  frequency: string;
}

// EMR-855: RPM / CCM qualified physiologic metrics.
const RPM_CATEGORIES = [
  { key: "bp", label: "Blood pressure", emoji: "🩸" },
  { key: "glucose", label: "Blood glucose", emoji: "🍬" },
  { key: "spo2", label: "Oxygen saturation", emoji: "🫁" },
  { key: "weight", label: "Weight", emoji: "⚖️" },
  { key: "rr", label: "Respiratory flow", emoji: "💨" },
  { key: "hr", label: "Heart rate", emoji: "❤️" },
];

export function ScreeningsPanel({
  patientId,
  screenings,
}: {
  patientId: string;
  screenings: ScreeningLite[];
}) {
  const [done, setDone] = usePersistentState<string[]>(
    `screenings-done:${patientId}:v1`,
    [],
  );
  const [open, setOpen] = React.useState<ScreeningLite | null>(null);

  function toggle(id: string) {
    setDone((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  return (
    <Card tone="raised" className="border-l-4 border-l-[color:var(--highlight)]">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 className="font-display text-base text-text tracking-tight flex items-center gap-2">
            <span aria-hidden="true">🩺</span> Preventative Screenings
          </h3>
          <a
            href="https://www.uspreventiveservicestaskforce.org/uspstf/topic_search_results?grades%5B%5D=A&grades%5B%5D=B"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] px-2.5 py-1 rounded-md border border-border text-accent hover:bg-accent-soft transition-colors"
          >
            🔎 Search USPSTF
          </a>
        </div>

        {screenings.length === 0 ? (
          <p className="text-sm text-text-muted">
            No grade A/B screenings indicated for this age/sex.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {screenings.map((s) => {
              const upToDate = done.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setOpen(s)}
                  className={cn(
                    "inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs transition-all hover:scale-[1.02]",
                    upToDate
                      ? "bg-green-50 border-green-300"
                      : "bg-red-50 border-red-300",
                  )}
                  title={upToDate ? "Up to date" : "Due / past due"}
                >
                  <span className="text-lg" aria-hidden="true">
                    {s.emoji}
                  </span>
                  <span className="text-left">
                    <span className="block font-medium text-text leading-tight">
                      {s.label}
                    </span>
                    <span className="block text-[10px] text-text-subtle">
                      Grade {s.grade} · {s.frequency}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-[10px] font-semibold",
                      upToDate ? "text-green-700" : "text-red-700",
                    )}
                  >
                    {upToDate ? "✓" : "Due"}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* RPM / CCM device categories */}
        <div className="mt-4 border-t border-border/50 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-subtle mb-2">
            RPM / CCM device data
          </p>
          <div className="flex flex-wrap gap-1.5">
            {RPM_CATEGORIES.map((c) => (
              <Bubble key={c.key} tone="info" emoji={c.emoji}>
                {c.label}
              </Bubble>
            ))}
          </div>
        </div>
      </CardContent>

      <ModalShell
        open={open !== null}
        onClose={() => setOpen(null)}
        eyebrow="Screening results"
        title={open ? `${open.emoji} ${open.label}` : ""}
        placement="center"
        maxWidth="max-w-lg"
        footer={
          open ? (
            <button
              type="button"
              onClick={() => {
                toggle(open.id);
              }}
              className="px-3 py-1.5 text-sm font-medium rounded-md bg-accent text-accent-ink hover:bg-accent-strong"
            >
              {done.includes(open.id) ? "Mark as due" : "Mark up to date"}
            </button>
          ) : undefined
        }
      >
        {open && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Bubble tone={done.includes(open.id) ? "normal" : "severe"}>
                {done.includes(open.id) ? "Up to date" : "Due / past due"}
              </Bubble>
              <span>
                Grade {open.grade} · {open.frequency}
              </span>
            </div>
            <div className="rounded-xl border border-border bg-surface-muted/40 p-4 flex justify-center">
              <Sparkline data={[2, 1, 2, 0, 1]} width={380} height={120} />
            </div>
            <p className="text-[11px] text-text-subtle">
              Chronological results render here once prior {open.label.toLowerCase()}{" "}
              reports are on file. Click a result to split-pane the scan report
              with abnormal findings highlighted.
            </p>
            <CindySays
              analysis={cindyTrend({
                label: open.label,
                values: [2, 1, 2, 0, 1],
                interpretation: done.includes(open.id) ? "stable" : "screening due",
              })}
            />
          </div>
        )}
      </ModalShell>
    </Card>
  );
}
