// Presentational renderer for an AvsDocument (EMR-1152).
// Used by both the provider verification panel and the patient portal page, so
// it's a pure server component — no hooks, no data fetching. Zen-Density styling
// (soft pastel, generous padding, no pop-ups): everything is a scannable,
// time-ordered component rather than a wall of prose.

import type { AvsDocument, MedicationActionTag } from "@/lib/domain/avs/types";

const ACTION_COPY: Record<MedicationActionTag, { label: string; tone: string; icon: string }> = {
  INITIATE: { label: "Start", tone: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "🆕" },
  TITRATE: { label: "Adjust", tone: "bg-amber-50 text-amber-700 border-amber-200", icon: "📈" },
  MAINTAIN: { label: "Keep taking", tone: "bg-sky-50 text-sky-700 border-sky-200", icon: "✅" },
  DISCONTINUE: { label: "Stop", tone: "bg-rose-50 text-rose-700 border-rose-200", icon: "🛑" },
};

export function AvsSummaryView({ doc }: { doc: AvsDocument }) {
  return (
    <div className="space-y-6 text-text">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
          After-visit summary
        </p>
        <h2 className="font-display text-2xl font-semibold tracking-tight">
          {doc.visitDate} · {doc.provider}
        </h2>
        <p className="text-sm leading-relaxed text-text-muted">{doc.narrative}</p>
      </header>

      {doc.calendars.length > 0 && (
        <section aria-labelledby="avs-meds" className="space-y-3">
          <h3 id="avs-meds" className="text-sm font-semibold uppercase tracking-[0.12em] text-text-subtle">
            Your medicine schedule
          </h3>
          {doc.calendars.map((cal) => (
            <div key={cal.molecule} className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="border-b border-border/70 bg-surface-muted/50 px-4 py-2.5">
                <p className="text-sm font-semibold">{cal.molecule}</p>
              </div>
              <ul className="divide-y divide-border/60">
                {cal.steps.map((step, i) => (
                  <li key={i} className="flex flex-col gap-1 px-4 py-3 md:flex-row md:items-center md:gap-4">
                    <span className="inline-flex w-fit items-center rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-semibold text-accent">
                      {step.dayRange}
                    </span>
                    <span className="text-sm font-medium">{step.instruction}</span>
                    <span className="text-xs text-text-muted">{step.timeOfDay}</span>
                    {step.goal && (
                      <span className="text-xs font-medium text-emerald-600 md:ml-auto">🎯 {step.goal}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {doc.decomposed.medications.some((m) => m.action === "DISCONTINUE") && (
        <section className="space-y-2">
          {doc.decomposed.medications
            .filter((m) => m.action === "DISCONTINUE")
            .map((m, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${ACTION_COPY.DISCONTINUE.tone}`}
              >
                <span aria-hidden>{ACTION_COPY.DISCONTINUE.icon}</span>
                <span className="font-medium">{ACTION_COPY.DISCONTINUE.label} {m.molecule}</span>
              </div>
            ))}
        </section>
      )}

      {(doc.roadmap.nutrition.length > 0 || doc.roadmap.behavior.length > 0) && (
        <section aria-labelledby="avs-lifestyle" className="space-y-3">
          <h3 id="avs-lifestyle" className="text-sm font-semibold uppercase tracking-[0.12em] text-text-subtle">
            Your everyday plan
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[...doc.roadmap.nutrition, ...doc.roadmap.behavior].map((item, i) => (
              <div key={i} className="flex gap-3 rounded-xl border border-border bg-surface px-4 py-3">
                <span className="text-2xl" aria-hidden>{item.icon}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-xs leading-relaxed text-text-muted">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {doc.nextSteps.length > 0 && (
        <section aria-labelledby="avs-next" className="space-y-2">
          <h3 id="avs-next" className="text-sm font-semibold uppercase tracking-[0.12em] text-text-subtle">
            What to do next
          </h3>
          <ol className="space-y-2">
            {doc.nextSteps.map((step, i) => (
              <li key={i} className="flex gap-3 rounded-lg bg-surface-muted/40 px-3 py-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section className="rounded-xl border border-highlight/30 bg-highlight-soft px-4 py-3">
        <p className="text-sm font-medium">{doc.followUp}</p>
      </section>
    </div>
  );
}
