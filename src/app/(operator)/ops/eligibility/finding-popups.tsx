"use client";

// EMR-942 — Leaf-icon popup buttons rendered inline in the eligibility
// "Findings" list.
//
//   • StateLegalityPopupButton — opens a color-coded grid of all 50 states
//     (+ DC). Hovering (or focusing) a state reveals its recreational /
//     medicinal / both / neither posture, with a legend. Backed by the local
//     `us-cannabis-legality` dataset.
//   • QualifyingConditionsPopupButton — opens a list of the top-10 conditions
//     that usually qualify a patient for medical marijuana.
//
// Both are small leaf buttons so they sit unobtrusively next to the relevant
// finding line, matching the Apple-iOS aesthetic (LeafSprig, rounded popups).

import { useMemo, useState } from "react";
import { ModalShell } from "@/components/ui/modal-shell";
import { Badge } from "@/components/ui/badge";
import { LeafSprig } from "@/components/ui/ornament";
import { cn } from "@/lib/utils/cn";
import {
  US_CANNABIS_LEGALITY,
  LEGALITY_LABEL,
  type LegalityStatus,
  type StateLegality,
} from "./us-cannabis-legality";
import { TOP_QUALIFYING_CONDITIONS } from "./qualifying-conditions";

// Color tokens per legality bucket. Kept inline (not Tailwind-dynamic) so the
// classes survive JIT purging.
const LEGALITY_SWATCH: Record<LegalityStatus, string> = {
  both: "bg-[color:var(--success)]/15 text-success border-[color:var(--success)]/40 hover:bg-[color:var(--success)]/25",
  recreational:
    "bg-accent-soft text-accent border-accent/40 hover:bg-accent/15",
  medicinal:
    "bg-highlight-soft text-[color:var(--highlight-hover)] border-highlight/40 hover:bg-highlight/15",
  neither:
    "bg-surface-muted text-text-subtle border-border-strong/40 hover:bg-surface-muted",
};

const LEGALITY_DOT: Record<LegalityStatus, string> = {
  both: "bg-[color:var(--success)]",
  recreational: "bg-accent",
  medicinal: "bg-highlight",
  neither: "bg-border-strong",
};

/** Tiny leaf button used to trigger a findings popup. */
function LeafTrigger({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full shrink-0",
        "border border-accent/20 bg-accent/5 text-accent",
        "transition-colors hover:bg-accent/15 hover:border-accent/40",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
      )}
    >
      <LeafSprig size={11} />
    </button>
  );
}

// ---------------------------------------------------------------------------
// EMR-942a — State legality popup
// ---------------------------------------------------------------------------

export function StateLegalityPopupButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LeafTrigger
        label="View US cannabis legality by state"
        onClick={() => setOpen(true)}
      />
      <StateLegalityModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function StateLegalityModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [hovered, setHovered] = useState<StateLegality | null>(null);

  // Counts per bucket for the legend.
  const counts = useMemo(() => {
    const c: Record<LegalityStatus, number> = {
      both: 0,
      recreational: 0,
      medicinal: 0,
      neither: 0,
    };
    for (const s of US_CANNABIS_LEGALITY) c[s.status] += 1;
    return c;
  }, []);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow="EMR-942 · Legal status"
      title="US cannabis legality"
      description="Hover or focus a state to see its recreational / medicinal posture."
      maxWidth="max-w-2xl"
      placement="center"
    >
      <div className="px-6 py-5 space-y-4">
        {/* Hover detail readout */}
        <div className="min-h-[2.75rem] flex items-center gap-3 rounded-xl border border-border bg-surface-muted/40 px-4 py-2.5">
          {hovered ? (
            <>
              <span
                className={cn(
                  "h-2.5 w-2.5 rounded-full shrink-0",
                  LEGALITY_DOT[hovered.status],
                )}
                aria-hidden="true"
              />
              <span className="text-sm font-medium text-text">
                {hovered.name}
              </span>
              <span className="text-sm text-text-muted">
                {LEGALITY_LABEL[hovered.status]}
              </span>
            </>
          ) : (
            <span className="text-sm text-text-subtle italic">
              Hover a state for its status…
            </span>
          )}
        </div>

        {/* State grid */}
        <div
          className="grid grid-cols-5 sm:grid-cols-7 md:grid-cols-9 gap-1.5"
          onMouseLeave={() => setHovered(null)}
        >
          {US_CANNABIS_LEGALITY.map((s) => (
            <button
              key={s.code}
              type="button"
              onMouseEnter={() => setHovered(s)}
              onFocus={() => setHovered(s)}
              aria-label={`${s.name}: ${LEGALITY_LABEL[s.status]}`}
              className={cn(
                "aspect-square rounded-md border text-[11px] font-medium tabular-nums",
                "flex items-center justify-center transition-colors",
                "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40",
                LEGALITY_SWATCH[s.status],
              )}
            >
              {s.code}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
          {(
            ["both", "recreational", "medicinal", "neither"] as LegalityStatus[]
          ).map((k) => (
            <span
              key={k}
              className="inline-flex items-center gap-1.5 text-[11px] text-text-muted"
            >
              <span
                className={cn("h-2.5 w-2.5 rounded-full", LEGALITY_DOT[k])}
                aria-hidden="true"
              />
              {LEGALITY_LABEL[k]}
              <span className="text-text-subtle">({counts[k]})</span>
            </span>
          ))}
        </div>

        <p className="text-[11px] text-text-subtle italic">
          Curated guidance — cannabis law changes frequently and program details
          vary. Verify with the state program before advising a patient.
        </p>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// EMR-942b — Qualifying conditions popup
// ---------------------------------------------------------------------------

export function QualifyingConditionsPopupButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <LeafTrigger
        label="View top qualifying conditions"
        onClick={() => setOpen(true)}
      />
      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        eyebrow="EMR-942 · Qualifying conditions"
        title="Top 10 usual qualifying conditions"
        description="Conditions most commonly accepted across state medical-cannabis programs."
        maxWidth="max-w-xl"
        placement="center"
      >
        <div className="px-6 py-5">
          <ol className="space-y-2.5">
            {TOP_QUALIFYING_CONDITIONS.map((c, i) => (
              <li
                key={c.name}
                className="flex items-start gap-3 rounded-lg border border-border bg-surface-muted/30 px-3 py-2.5"
              >
                <Badge tone="accent" className="shrink-0 tabular-nums">
                  {i + 1}
                </Badge>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{c.name}</p>
                  <p className="text-xs text-text-muted mt-0.5">{c.note}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-4 text-[11px] text-text-subtle italic">
            Qualifying conditions vary by state — confirm against the specific
            state program for an individual patient.
          </p>
        </div>
      </ModalShell>
    </>
  );
}
