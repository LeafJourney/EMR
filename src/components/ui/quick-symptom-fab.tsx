"use client";

import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils/cn";
import { quickLogSymptom } from "@/app/(patient)/portal/outcomes/quick-log-action";
import { confettiEmitter } from "@/components/portal/confetti-canvas";

type Symptom = {
  key: "pain" | "sleep" | "anxiety" | "nausea" | "energy" | "mood";
  label: string;
  emoji: string;
  anchorLow: string;
  anchorHigh: string;
};

const SYMPTOMS: Symptom[] = [
  { key: "pain", label: "Pain", emoji: "🤕", anchorLow: "None", anchorHigh: "Severe" },
  { key: "sleep", label: "Sleep", emoji: "😴", anchorLow: "Terrible", anchorHigh: "Great" },
  { key: "anxiety", label: "Anxiety", emoji: "😰", anchorLow: "Calm", anchorHigh: "Very anxious" },
  { key: "nausea", label: "Nausea", emoji: "🤢", anchorLow: "None", anchorHigh: "Severe" },
  { key: "energy", label: "Energy", emoji: "⚡", anchorLow: "Depleted", anchorHigh: "Energized" },
  { key: "mood", label: "Mood", emoji: "🙂", anchorLow: "Low", anchorHigh: "Great" },
];

type View = "closed" | "picker" | "rate" | "saved";

/**
 * QuickSymptomFab — fixed bottom-right floating action button that opens
 * a quick symptom rating panel, then an emoji + 1-10 slider, and posts
 * the rating as a new OutcomeLog via the quickLogSymptom server action.
 */
export function QuickSymptomFab() {
  const [view, setView] = useState<View>("closed");
  const [symptom, setSymptom] = useState<Symptom | null>(null);
  const [rating, setRating] = useState(5);
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    if (view === "closed") return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  function close() {
    setView("closed");
    setSymptom(null);
    setRating(5);
    setErrorMsg(null);
  }

  function pickSymptom(s: Symptom) {
    setSymptom(s);
    setRating(5);
    setView("rate");
  }

  function submit() {
    if (!symptom) return;
    setErrorMsg(null);
    startTransition(async () => {
      const res = await quickLogSymptom({ metric: symptom.key, value: rating });
      if (res.ok) {
        setView("saved");
        
        if (res.newlyEarnedBadges && res.newlyEarnedBadges.length > 0) {
          confettiEmitter.emit({
            id: `badge-${Date.now()}`,
            type: "badge_earned",
            message: "You earned a new badge!",
          });
        }

        setTimeout(close, 1600);
      } else {
        setErrorMsg(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setView(view === "closed" ? "picker" : "closed")}
        aria-label={view === "closed" ? "Quick log a symptom" : "Close symptom logger"}
        aria-expanded={view !== "closed"}
        className={cn(
          "fixed bottom-[160px] right-5 sm:bottom-[160px] sm:right-6 z-40",
          "flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-to-b from-accent to-accent-strong text-accent-ink",
          "shadow-[0_12px_30px_-10px_rgba(4,120,87,0.6)]",
          "transition-all duration-200 ease-smooth",
          "hover:scale-105 active:scale-95",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2",
          view !== "closed" && "rotate-45"
        )}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>

      {view !== "closed" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Quick symptom logger"
          className="fixed inset-0 z-30 flex items-end sm:items-center justify-center px-4 pb-24 sm:pb-6 bg-black/30 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            className={cn(
              "w-full sm:max-w-md rounded-2xl bg-surface-raised border border-border shadow-2xl",
              "p-5 sm:p-6 animate-[fabSlide_250ms_ease-out_forwards]"
            )}
          >
            <style>{`
              @keyframes fabSlide {
                0% { opacity: 0; transform: translateY(12px); }
                100% { opacity: 1; transform: translateY(0); }
              }
            `}</style>

            {view === "picker" && (
              <>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-3">
                  Quick log
                </p>
                <h3 className="font-display text-xl text-text tracking-tight mb-4">
                  How are you feeling?
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {SYMPTOMS.map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => pickSymptom(s)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 rounded-2xl",
                        "min-h-[88px] py-3 px-2",
                        "bg-surface-muted border border-border/60",
                        "hover:bg-surface-raised hover:border-accent/50 hover:scale-[1.03]",
                        "transition-all duration-200 ease-smooth",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                      )}
                    >
                      <span className="text-3xl leading-none" aria-hidden="true">
                        {s.emoji}
                      </span>
                      <span className="text-xs font-medium text-text">{s.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}

            {view === "rate" && symptom && (
              <>
                <button
                  type="button"
                  onClick={() => setView("picker")}
                  className="text-xs text-text-subtle hover:text-text-muted mb-2 inline-flex items-center gap-1 min-h-[32px]"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="15 18 9 12 15 6" />
                  </svg>
                  Back
                </button>
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-4xl leading-none" aria-hidden="true">
                    {symptom.emoji}
                  </span>
                  <div>
                    <h3 className="font-display text-xl text-text tracking-tight">
                      Rate your {symptom.label.toLowerCase()}
                    </h3>
                    <p className="text-xs text-text-subtle mt-0.5">
                      {symptom.anchorLow} (0) → {symptom.anchorHigh} (10)
                    </p>
                  </div>
                </div>

                <div className="bg-surface-muted rounded-xl p-5 mb-4">
                  <div className="flex items-center justify-center mb-3">
                    <span className="font-display text-5xl text-accent tabular-nums">
                      {rating}
                    </span>
                    <span className="text-sm text-text-subtle ml-1">/ 10</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={1}
                    value={rating}
                    onChange={(e) => setRating(parseInt(e.target.value, 10))}
                    aria-label={`${symptom.label} rating`}
                    className="w-full accent-accent h-2"
                  />
                  <div className="flex justify-between text-[11px] text-text-subtle mt-2">
                    <span>{symptom.anchorLow}</span>
                    <span>{symptom.anchorHigh}</span>
                  </div>
                </div>

                {errorMsg && (
                  <p className="text-sm text-danger mb-3">{errorMsg}</p>
                )}

                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={close}
                    className="min-h-[44px] px-4 rounded-md text-sm font-medium bg-surface-muted text-text border border-border-strong/60 hover:bg-surface transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={isPending}
                    className={cn(
                      "min-h-[44px] px-5 rounded-md text-sm font-medium",
                      "bg-gradient-to-b from-accent to-accent-strong text-accent-ink shadow-seal",
                      "hover:brightness-110 transition-all",
                      "disabled:opacity-60 disabled:cursor-not-allowed"
                    )}
                  >
                    {isPending ? "Saving…" : "Log rating"}
                  </button>
                </div>
              </>
            )}

            {view === "saved" && symptom && (
              <div className="flex flex-col items-center text-center py-6">
                <span className="text-5xl leading-none mb-3" aria-hidden="true">
                  ✅
                </span>
                <h3 className="font-display text-xl text-text tracking-tight">
                  Logged!
                </h3>
                <p className="text-sm text-text-muted mt-1">
                  {symptom.label} {rating}/10 saved to your chart.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
