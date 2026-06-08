"use client";

// AI setup review — calls the real model client on demand (runAiSetupReview).
// When AI isn't configured the action reports ai:false and we fall back to the
// deterministic rule-based read, clearly labelled. Recommendations are advisory
// (human stays in control); nothing is auto-applied.

import * as React from "react";
import type { PracticeLifecycle } from "../lifecycle";
import { runAiSetupReview } from "./ai-review-action";

export function PracticeAiReview({
  organizationId,
  practiceName,
  specialty,
  careModel,
  lifecycle,
}: {
  organizationId: string;
  practiceName: string;
  specialty: string | null;
  careModel: string | null;
  lifecycle: PracticeLifecycle;
}) {
  const rulePreview = lifecycle.reviewFlags.slice(0, 3);
  const [state, setState] = React.useState<
    "idle" | "loading" | "ai" | "unavailable" | "error"
  >("idle");
  const [suggestions, setSuggestions] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setState("loading");
    setError(null);
    const res = await runAiSetupReview({
      organizationId,
      practiceName,
      specialty,
      careModel,
      readinessScore: lifecycle.readinessScore,
      missingChecklist: lifecycle.checklist
        .filter((c) => !c.done)
        .map((c) => c.label),
      reviewFlags: lifecycle.reviewFlags,
    });
    if (!res.ok) {
      setError(res.message);
      setState("error");
      return;
    }
    if (!res.ai) {
      setState("unavailable");
      return;
    }
    setSuggestions(res.suggestions);
    setState("ai");
  }

  const ran = state === "ai" || state === "unavailable" || state === "error";

  return (
    <section className="rounded-2xl border border-dashed border-accent/30 bg-accent-soft/10 p-5 md:p-6 grid gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-lg" aria-hidden="true">
            ✨
          </span>
          <span className="font-display text-base text-text tracking-tight">
            AI setup review
          </span>
        </div>
        <button
          type="button"
          onClick={run}
          disabled={state === "loading"}
          className="text-[12px] rounded-lg border border-accent/30 text-accent px-3 py-1 hover:bg-accent-soft/40 disabled:opacity-50 transition-colors"
        >
          {state === "loading"
            ? "Reviewing…"
            : ran
              ? "Re-run review"
              : "Run AI review"}
        </button>
      </div>

      {state === "ai" ? (
        <>
          <p className="text-[12px] text-text-muted">
            AI recommendations — review and apply at your discretion (nothing is
            auto-applied):
          </p>
          <ul className="grid gap-1.5">
            {suggestions.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-text">
                <span className="text-accent" aria-hidden="true">
                  ›
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="text-[13px] text-text-muted">
            {state === "unavailable"
              ? "AI review isn’t configured in this environment — here’s a rule-based read of what stands out:"
              : "Run a review of this practice’s configuration for recommendations — or here’s a rule-based read for now:"}
          </p>
          {state === "error" && error && (
            <p className="text-[13px] text-rose-deep">{error}</p>
          )}
          {rulePreview.length === 0 ? (
            <p className="text-[13px] text-text">
              Nothing stands out — this practice looks ready.
            </p>
          ) : (
            <ul className="grid gap-1.5">
              {rulePreview.map((f, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13px] text-text"
                >
                  <span className="text-accent" aria-hidden="true">
                    ›
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
