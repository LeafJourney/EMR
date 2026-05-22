"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { InteractionBadge } from "@/components/ui/interaction-badge";
import type { DrugInteraction, Severity } from "@/lib/domain/drug-interactions";

const GROUPS: { severity: Severity; heading: string }[] = [
  { severity: "red", heading: "Contraindicated" },
  { severity: "yellow", heading: "Use with caution" },
  { severity: "green", heading: "No known interaction" },
];

const BUBBLE: Record<Severity, string> = {
  red: "bg-red-50 border-red-200 text-danger hover:bg-red-100",
  yellow: "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100",
  green: "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100",
};

const RING: Record<Severity, string> = {
  red: "ring-2 ring-danger/40 ring-offset-1",
  yellow: "ring-2 ring-amber-400/50 ring-offset-1",
  green: "ring-2 ring-emerald-400/50 ring-offset-1",
};

const DOT: Record<Severity, string> = {
  red: "bg-danger",
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
};

export function InteractionBubbles({
  interactions,
}: {
  interactions: DrugInteraction[];
}) {
  const [selected, setSelected] = useState<string | null>(null);

  const toggle = (key: string) =>
    setSelected((prev) => (prev === key ? null : key));

  return (
    <div className="space-y-5">
      {GROUPS.map(({ severity, heading }) => {
        const group = interactions.filter((i) => i.severity === severity);
        if (group.length === 0) return null;
        const detail = group.find(
          (i) => `${i.drug}|${i.cannabinoid}` === selected,
        );

        return (
          <div key={severity}>
            <p className="text-xs text-text-subtle uppercase tracking-wider mb-2">
              {heading} &middot; {group.length}
            </p>
            <div className="flex flex-wrap gap-2">
              {group.map((interaction) => {
                const key = `${interaction.drug}|${interaction.cannabinoid}`;
                const isOpen = selected === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggle(key)}
                    aria-expanded={isOpen}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full border transition-colors capitalize",
                      BUBBLE[severity],
                      isOpen && RING[severity],
                    )}
                  >
                    <span
                      className={cn("h-1.5 w-1.5 rounded-full shrink-0", DOT[severity])}
                      aria-hidden="true"
                    />
                    {interaction.drug}
                    <span className="opacity-50 font-normal text-[10px]">
                      {interaction.cannabinoid}
                    </span>
                  </button>
                );
              })}
            </div>

            {detail && (
              <div className="mt-3 rounded-lg border border-border bg-surface-muted p-4 text-sm">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="font-medium text-text capitalize">{detail.drug}</p>
                    <p className="text-xs text-text-muted">
                      Cannabinoid: {detail.cannabinoid}
                    </p>
                  </div>
                  <InteractionBadge severity={detail.severity} />
                </div>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-1">
                      Mechanism
                    </p>
                    <p className="text-text-muted leading-relaxed">{detail.mechanism}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-1">
                      Recommendation
                    </p>
                    <p className="text-text-muted leading-relaxed">
                      {detail.recommendation}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="mt-3 text-[11px] text-text-subtle hover:text-text transition-colors"
                >
                  Close ✕
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
