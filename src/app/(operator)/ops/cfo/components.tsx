import * as React from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sparkline } from "@/components/ui/sparkline";
import { Eyebrow } from "@/components/ui/ornament";
import { fmtMoney, fmtPct, changeBadgeText } from "@/lib/finance/formatting";
import type { KpiCard } from "@/lib/finance/kpis";
import type { Anomaly } from "@/lib/finance/anomalies";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// Shared CFO page primitives (server-rendered)
// ---------------------------------------------------------------------------

export function CfoTabs({ active }: { active: "overview" | "pnl" | "cash-flow" | "balance-sheet" | "expenses" | "cash" | "assets" | "liabilities" | "equity" | "goals" | "reports" }) {
  const tabs: Array<{ id: typeof active; label: string; href: string }> = [
    { id: "overview", label: "Overview", href: "/ops/cfo" },
    { id: "pnl", label: "P&L", href: "/ops/cfo/pnl" },
    { id: "cash-flow", label: "Cash Flow", href: "/ops/cfo/cash-flow" },
    { id: "balance-sheet", label: "Balance Sheet", href: "/ops/cfo/balance-sheet" },
    { id: "expenses", label: "Expenses", href: "/ops/cfo/expenses" },
    { id: "cash", label: "Cash", href: "/ops/cfo/cash" },
    { id: "assets", label: "Assets", href: "/ops/cfo/assets" },
    { id: "liabilities", label: "Liabilities", href: "/ops/cfo/liabilities" },
    { id: "equity", label: "Equity", href: "/ops/cfo/equity" },
    { id: "goals", label: "Goals", href: "/ops/cfo/goals" },
    { id: "reports", label: "Reports", href: "/ops/cfo/reports" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-1 mb-8 -mt-4 border-b border-border/60 pb-2">
      {tabs.map((t) => (
        <Link
          key={t.id}
          href={t.href}
          className={cn(
            "px-3 py-1.5 rounded-md text-sm transition-colors",
            t.id === active
              ? "bg-accent/10 text-accent font-medium"
              : "text-text-muted hover:text-text hover:bg-surface-muted",
          )}
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}

export function KpiTile({ kpi }: { kpi: KpiCard }) {
  const value =
    kpi.unit === "cents"
      ? fmtMoney(kpi.valueCents ?? 0, { compact: true })
      : kpi.unit === "pct"
        ? fmtPct(kpi.valueNumber ?? 0)
        : kpi.unit === "days"
          ? `${kpi.valueNumber ?? 0}d`
          : kpi.unit === "ratio"
            ? (kpi.valueNumber ?? 0).toFixed(2)
            : `${kpi.valueNumber ?? 0}`;

  const change = changeBadgeText(kpi.changePct ?? null);
  const badgeTone =
    change.tone === "good" ? "success" : change.tone === "bad" ? "danger" : "neutral";

  return (
    <Card tone="raised" className="card-hover">
      <CardContent className="pt-6 pb-6">
        <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">{kpi.label}</p>
        <p className="font-display text-2xl text-text tabular-nums mt-1.5">{value}</p>
        <div className="flex items-center gap-2 mt-2">
          {kpi.changePct !== undefined && kpi.changePct !== null ? (
            <Badge tone={badgeTone as any} className="text-[9px]">
              {change.text} vs prior
            </Badge>
          ) : null}
          {kpi.goalValue !== undefined && kpi.goalValue !== null ? (
            <Badge
              tone="neutral"
              className={kpi.goalMet
                ? "text-[9px] bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300"
                : "text-[9px] bg-highlight-soft text-[color:var(--highlight-hover)] border-highlight/25"}
            >
              {kpi.goalMet ? "on goal" : "off goal"}
            </Badge>
          ) : null}
        </div>
        {kpi.description && (
          <p className="text-[11px] text-text-subtle mt-2 leading-snug">{kpi.description}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function AnomaliesPanel({ anomalies }: { anomalies: Anomaly[] }) {
  if (anomalies.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 pb-6">
          <p className="text-sm text-text-muted">
            No anomalies detected — every metric is tracking within range.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-2">
      {anomalies.map((a) => {
        const tone =
          a.severity === "critical"
            ? "border-l-danger bg-danger/[0.04]"
            : a.severity === "warn"
              ? "border-l-[color:var(--warning)] bg-[color:var(--warning)]/[0.04]"
              : "border-l-accent/40";
        const badgeTone = a.severity === "critical" ? "danger" : a.severity === "warn" ? "warning" : "accent";
        return (
          <div
            key={a.id}
            className={cn(
              "flex items-start gap-3 px-4 py-3 rounded-lg border-l-4",
              tone,
            )}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <Badge tone={badgeTone as any} className="text-[9px]">
                  {a.severity}
                </Badge>
                <Badge tone="neutral" className="text-[9px]">
                  {a.category.replace("_", " ")}
                </Badge>
              </div>
              <p className="text-sm text-text">{a.message}</p>
              {a.recommendation && (
                <p className="text-[12px] text-text-muted mt-1 italic">→ {a.recommendation}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** A compact bar-chart row for trend visualization (no chart library). */
export function MiniBarChart({
  data,
  width = 720,
  height = 120,
  color = "var(--accent)",
}: {
  data: Array<{ label: string; value: number }>;
  width?: number;
  height?: number;
  color?: string;
}) {
  if (data.length === 0) return null;
  const padding = 24;
  const innerW = width - padding * 2;
  const innerH = height - padding;
  const max = Math.max(1, ...data.map((d) => Math.abs(d.value)));
  const barW = innerW / data.length;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="text-text-subtle">
      {data.map((d, i) => {
        const x = padding + i * barW;
        const h = (Math.abs(d.value) / max) * innerH;
        const y = d.value >= 0 ? padding + innerH - h : padding + innerH;
        const barColor = d.value >= 0 ? color : "var(--danger)";
        return (
          <g key={i}>
            <rect
              x={x + barW * 0.15}
              y={y}
              width={barW * 0.7}
              height={Math.max(2, h)}
              rx={2}
              fill={barColor}
              opacity={d.value < 0 ? 0.85 : 0.85}
            />
            {i % Math.ceil(data.length / 6) === 0 && (
              <text
                x={x + barW / 2}
                y={height - 4}
                textAnchor="middle"
                fontSize="9"
                fill="currentColor"
              >
                {d.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

import { generateCfoReportAction } from "./actions";

export function GenerateReportButton({ period = "weekly" }: { period?: string }) {
  return (
    <form action={generateCfoReportAction}>
      <input type="hidden" name="period" value={period} />
      <Button type="submit" size="sm" variant="primary">
        Generate {period} report
      </Button>
    </form>
  );
}

export function StatementSection({
  title,
  totalLabel,
  totalCents,
  lines,
  emphasized = false,
}: {
  title: string;
  totalLabel?: string;
  totalCents: number;
  lines: Array<{ label: string; amountCents: number; detail?: string; itemCount?: number }>;
  emphasized?: boolean;
}) {
  return (
    <Card tone="raised" className={emphasized ? "border-l-4 border-l-accent" : ""}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base text-text">{title}</h3>
          <span className="font-display text-base text-text tabular-nums">
            {fmtMoney(totalCents)}
          </span>
        </div>
        {lines.length > 0 ? (
          <div className="divide-y divide-border/60">
            {lines.map((l, i) => (
              <div key={`${l.label}-${i}`} className="flex items-center justify-between py-2 gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-text truncate">{l.label}</p>
                  {l.detail && (
                    <p className="text-[11px] text-text-subtle truncate">{l.detail}</p>
                  )}
                </div>
                <span className="text-sm tabular-nums text-text-muted shrink-0">
                  {fmtMoney(l.amountCents)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-text-subtle italic">No items in this period.</p>
        )}
        {totalLabel && (
          <div className="mt-3 pt-3 border-t border-border/60 flex justify-between">
            <span className="text-sm font-medium text-text">{totalLabel}</span>
            <span className="font-display text-sm text-text tabular-nums">{fmtMoney(totalCents)}</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export { fmtMoney, fmtPct, Eyebrow };
