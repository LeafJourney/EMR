"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { fmtMoney } from "@/lib/finance/formatting";
import { cn } from "@/lib/utils/cn";

// EMR-1031 — The P&L "Detail statement" cards (Revenue / COGS / OpEx / D&A /
// Interest / Tax) used to sit on the main page. This moves each breakdown into
// the pop-up that opens when its related Headline KPI tile is clicked, so the
// page leads with the KPIs and the detail is one click away.

export interface PnlSectionView {
  title: string;
  totalLabel?: string;
  totalCents: number;
  emphasized?: boolean;
  lines: { label: string; amountCents: number; detail?: string }[];
}

export interface PnlKpiView {
  id: string;
  label: string;
  valueDisplay: string;
  /** Change-vs-prior badge text, or null to hide it. */
  changeText: string | null;
  badgeTone: "success" | "danger" | "neutral";
  /** Detail sections shown in this KPI's drill-in popup. */
  sections: PnlSectionView[];
}

export function PnlKpiGrid({ kpis }: { kpis: PnlKpiView[] }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const active = openId ? kpis.find((k) => k.id === openId) ?? null : null;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
        {kpis.map((k) => (
          <button
            key={k.id}
            type="button"
            onClick={() => setOpenId(k.id)}
            aria-haspopup="dialog"
            aria-label={`${k.label}: ${k.valueDisplay}. View breakdown`}
            className={cn(
              "group rounded-2xl border border-border/80 bg-surface-raised px-5 py-5 text-left shadow-sm",
              "transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-border-strong",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
            )}
          >
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">
              {k.label}
            </p>
            <p className="font-display text-2xl text-text tabular-nums mt-1.5">
              {k.valueDisplay}
            </p>
            {k.changeText && (
              <Badge tone={k.badgeTone} className="text-[9px] mt-2">
                {k.changeText} vs prior
              </Badge>
            )}
            <span className="mt-2 block text-[10px] font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">
              View breakdown →
            </span>
          </button>
        ))}
      </div>

      <Dialog open={!!active} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-w-2xl">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {active.label} · {active.valueDisplay}
                </DialogTitle>
                {active.changeText && (
                  <p className="text-sm text-text-muted">
                    {active.changeText} vs prior period
                  </p>
                )}
              </DialogHeader>
              <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
                {active.sections.map((s, i) => (
                  <SectionBreakdown key={`${s.title}-${i}`} section={s} />
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// Local mirror of the server-side <StatementSection> presentation, kept inline
// so this client component doesn't pull the server `../components` module into
// the client bundle.
function SectionBreakdown({ section }: { section: PnlSectionView }) {
  const { title, totalLabel, totalCents, lines, emphasized } = section;
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface px-4 py-4",
        emphasized && "border-l-4 border-l-accent",
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-base text-text">{title}</h3>
        <span className="font-display text-base text-text tabular-nums">
          {fmtMoney(totalCents)}
        </span>
      </div>
      {lines.length > 0 ? (
        <div className="divide-y divide-border/60">
          {lines.map((l, i) => (
            <div
              key={`${l.label}-${i}`}
              className="flex items-center justify-between py-2 gap-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-text truncate">{l.label}</p>
                {l.detail && (
                  <p className="text-[11px] text-text-subtle truncate">
                    {l.detail}
                  </p>
                )}
              </div>
              <span className="text-sm tabular-nums text-text-muted shrink-0">
                {fmtMoney(l.amountCents)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-text-subtle italic">
          No items in this period.
        </p>
      )}
      {totalLabel && (
        <div className="mt-3 pt-3 border-t border-border/60 flex justify-between">
          <span className="text-sm font-medium text-text">{totalLabel}</span>
          <span className="font-display text-sm text-text tabular-nums">
            {fmtMoney(totalCents)}
          </span>
        </div>
      )}
    </div>
  );
}
