"use client";

/**
 * BillingKpiCards — the 4 KPI tiles for /ops/billing.
 *
 * Why a local component instead of the shared <StatCard>:
 *   • EMR-945 — the shared StatCard renders its hint at text-[10px]; we want
 *     a noticeably larger hint here and must not edit the shared component.
 *   • EMR-937 — each tile is clickable and opens a "LeafNerd" analytics popup
 *     charting that metric's history per day / week / month / year.
 *
 * Visual language deliberately mirrors StatCard (same Card tone="raised",
 * uppercase label, font-display value) so the page stays consistent.
 */

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { LeafNerdModal, type MetricKey } from "./leafnerd-modal";

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

const TONE_COLORS: Record<Tone, string> = {
  neutral: "text-text",
  accent: "text-accent",
  success: "text-success",
  warning: "text-[color:var(--warning)]",
  danger: "text-danger",
  info: "text-[color:var(--info)]",
};

export interface BillingKpi {
  key: MetricKey;
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
  /** Current value in cents (or count) — seeds the LeafNerd history series. */
  currentValue: number;
  /** Render the series as money vs. a plain count. */
  format: "money" | "count";
}

export function BillingKpiCards({ kpis }: { kpis: BillingKpi[] }) {
  const [openKey, setOpenKey] = React.useState<MetricKey | null>(null);
  const active = kpis.find((k) => k.key === openKey) ?? null;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi) => (
          <button
            key={kpi.key}
            type="button"
            onClick={() => setOpenKey(kpi.key)}
            className="text-left group focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-2xl"
            aria-label={`Open LeafNerd analytics for ${kpi.label}`}
          >
            <Card
              tone="raised"
              className="h-full transition-all group-hover:shadow-md group-hover:-translate-y-0.5"
            >
              <CardContent className="pt-5 pb-5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-text-subtle uppercase tracking-wider">
                    {kpi.label}
                  </p>
                  <span
                    className="text-[10px] font-medium text-accent opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"
                    aria-hidden="true"
                  >
                    LeafNerd ↗
                  </span>
                </div>
                <p
                  className={cn(
                    "font-display tabular-nums mt-1 text-2xl",
                    TONE_COLORS[kpi.tone ?? "neutral"],
                  )}
                >
                  {kpi.value}
                </p>
                {/* EMR-945 — enlarged hint sub-text (was text-[10px] on StatCard). */}
                <p className="text-sm text-text-muted mt-1.5">{kpi.hint}</p>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {active && (
        <LeafNerdModal
          metricKey={active.key}
          label={active.label}
          currentValue={active.currentValue}
          format={active.format}
          tone={active.tone ?? "neutral"}
          onClose={() => setOpenKey(null)}
        />
      )}
    </>
  );
}
