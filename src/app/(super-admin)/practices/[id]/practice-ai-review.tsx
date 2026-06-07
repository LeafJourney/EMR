// AI setup-review surface — scaffolded so AI can become a force multiplier
// here without pretending it already works. There is no AI setup-review
// endpoint yet, so this NEVER fabricates AI output: it shows a rule-based
// preview of the deterministic lifecycle signals, clearly labelled, and lays
// out what a real reviewer will add.
//
// TODO(ai-setup-review): when an AI setup-review endpoint exists, call it and
// render its recommendations here (framed as suggestions, human stays in
// control — never auto-applied to compliance-critical config).

import type { PracticeLifecycle } from "../lifecycle";

export function PracticeAiReview({
  lifecycle,
}: {
  lifecycle: PracticeLifecycle;
}) {
  const preview = lifecycle.reviewFlags.slice(0, 3);

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
        <span className="inline-flex items-center rounded-full border border-border text-[10px] uppercase tracking-wide text-text-muted px-2 py-0.5">
          Rule-based preview · AI soon
        </span>
      </div>
      <p className="text-[13px] text-text-muted">
        A future AI reviewer will read this practice&apos;s configuration to
        recommend missing tooling, flag duplicate or inconsistent data, and
        suggest who to invite — as suggestions you approve, never auto-applied.
        For now, here&apos;s a rule-based read of what stands out:
      </p>
      {preview.length === 0 ? (
        <p className="text-[13px] text-text">
          Nothing stands out — this practice looks ready.
        </p>
      ) : (
        <ul className="grid gap-1.5">
          {preview.map((f, i) => (
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
    </section>
  );
}
