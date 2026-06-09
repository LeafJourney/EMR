// Practice activation layer — the "gate" between the creation pipeline and an
// operational practice. Renders the derived lifecycle stage, setup-readiness,
// the required checklist, gentle review flags, and state-aware next actions.
// Display + links only (server component); reads the pure lifecycle helper.

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { PracticeCardData } from "../types";
import type { PracticeLifecycle } from "../lifecycle";

export function PracticeActivation({
  practice,
  lifecycle,
}: {
  practice: PracticeCardData;
  lifecycle: PracticeLifecycle;
}) {
  const { label, tone, readinessScore, checklist, reviewFlags, nextActions } =
    lifecycle;
  const done = checklist.filter((c) => c.done).length;

  return (
    <section className="rounded-2xl border border-border bg-surface-raised p-5 md:p-6 grid gap-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
            Setup readiness
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={tone}>{label}</Badge>
            <span className="text-[13px] text-text-muted">
              {done} of {checklist.length} steps complete
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="font-display text-3xl text-text tracking-tight tabular-nums">
            {readinessScore}%
          </div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted">
            ready
          </div>
        </div>
      </div>

      <div
        className="h-2 w-full rounded-full bg-surface-muted overflow-hidden"
        role="progressbar"
        aria-valuenow={readinessScore}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-accent transition-all"
          style={{ width: `${readinessScore}%` }}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
            Checklist
          </div>
          <ul className="grid gap-1.5">
            {checklist.map((c) => (
              <li key={c.key} className="flex items-start gap-2 text-[13px]">
                <span
                  className={c.done ? "text-emerald-600" : "text-text-subtle"}
                  aria-hidden="true"
                >
                  {c.done ? "✓" : "○"}
                </span>
                <span className={c.done ? "text-text" : "text-text-muted"}>
                  {c.label}
                  {!c.done && c.hint && (
                    <span className="block text-[11px] text-text-subtle">
                      {c.hint}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
            Needs attention
          </div>
          {reviewFlags.length === 0 ? (
            <div className="text-[12px] text-text-muted italic">
              Nothing flagged — this practice looks healthy.
            </div>
          ) : (
            <ul className="grid gap-1.5">
              {reviewFlags.map((f, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13px] text-text"
                >
                  <span className="text-amber-500" aria-hidden="true">
                    •
                  </span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {nextActions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60 mt-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted mr-1 mt-2">
            What&apos;s next
          </span>
          {nextActions.map((a, i) =>
            a.href ? (
              <Link
                key={i}
                href={a.href}
                className={
                  a.primary
                    ? "mt-2 inline-flex items-center rounded-lg bg-accent text-accent-ink text-[13px] font-semibold px-3 py-1.5 hover:bg-accent-hover transition-colors"
                    : "mt-2 inline-flex items-center rounded-lg border border-border text-[13px] text-text px-3 py-1.5 hover:bg-surface-muted transition-colors"
                }
              >
                {a.label}
              </Link>
            ) : (
              // Scaffolded action — team invitations need a backend model
              // (slice ②c wires this); rendered non-interactive, not a dead button.
              <span
                key={i}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border text-[13px] text-text-muted px-3 py-1.5"
                title="Team invitations are coming soon"
              >
                {a.label}
                <span className="text-[10px] uppercase tracking-wide">soon</span>
              </span>
            ),
          )}
        </div>
      )}
    </section>
  );
}
