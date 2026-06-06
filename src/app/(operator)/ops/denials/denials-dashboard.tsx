"use client";

/**
 * Denials dashboard — interactive client island.
 *
 * Owns the shared filter state across the hero KPI tiles (EMR-932), the compact
 * 4-bubble filter bar (EMR-971), the denial root-cause panel (EMR-947), the
 * payer-mix panel (EMR-956/965) and the worklist. All heavy data is fetched +
 * serialized server-side in page.tsx and handed in as plain props.
 *
 * Charts are inline SVG. "Cindy says" bullets are DETERMINISTIC text computed
 * from the data (no LLM call), consistent with how this codebase stubs AI.
 */

import { useMemo, useRef, useState, type ReactNode } from "react";
import { Sparkles, ChevronDown, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModalShell } from "@/components/ui/modal-shell";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/format";
import { DenialCard, type TimelineEntry } from "./denials-client";

// ---------------------------------------------------------------------------
// Serialized prop shapes (all plain JSON — no Date / Prisma objects)
// ---------------------------------------------------------------------------

export type DenialRow = {
  id: string;
  // DenialCard display props
  urgency: "high" | "medium" | "low";
  urgencyTone: "danger" | "warning" | "neutral";
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  serviceDateLabel: string;
  payerName: string | null;
  claimNumber: string | null;
  deniedRelative: string | null;
  billedLabel: string;
  triageLabel: string;
  triageCategory: string;
  triageDescription: string;
  denialReason: string | null;
  suggestedActionLabel: string;
  timeline: TimelineEntry[];
  // Filter facets
  category: string;
  billedAmountCents: number;
  deniedAtISO: string | null;
};

export type CategoryStat = {
  category: string;
  label: string;
  description: string;
  count: number;
  dollars: number;
};

export type PayerStat = {
  payer: string;
  count: number;
  dollars: number;
};

export type DenialsDashboardProps = {
  rows: DenialRow[];
  categoryStats: CategoryStat[];
  payerStats: PayerStat[];
  totalDenials: number;
  totalDollars: number;
  highUrgencyCount: number;
  recoveryTargetCents: number;
  recoveredCents: number;
};

type RangeKey = "30d" | "90d" | "3m" | "6m" | "12m";

const RANGE_LABEL: Record<RangeKey, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "3m": "3-month view",
  "6m": "6-month view",
  "12m": "12-month view",
};

const RANGE_MONTHS: Record<RangeKey, number> = {
  "30d": 1,
  "90d": 3,
  "3m": 3,
  "6m": 6,
  "12m": 12,
};

// ---------------------------------------------------------------------------
// Deterministic synthetic series helpers (no real source / LLM)
// ---------------------------------------------------------------------------

// Stable pseudo-random in [0,1) from a string seed — keeps charts/bullets
// identical across renders without a real data source.
function seededUnit(seed: string, i: number): number {
  let h = 2166136261 ^ i;
  for (let k = 0; k < seed.length; k++) {
    h ^= seed.charCodeAt(k);
    h = Math.imul(h, 16777619);
  }
  // map to [0,1)
  return ((h >>> 0) % 1000) / 1000;
}

// Build a monthly series that sums (roughly) to `total` shaped by the seed.
function monthlySeries(seed: string, months: number, total: number): number[] {
  const raw = Array.from({ length: months }, (_, i) => 0.4 + seededUnit(seed, i));
  const sum = raw.reduce((a, b) => a + b, 0) || 1;
  return raw.map((v) => Math.round((v / sum) * total));
}

function monthLabels(months: number): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(d.toLocaleString("en-US", { month: "short" }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Inline SVG line chart (one or more labeled series)
// ---------------------------------------------------------------------------

type Series = { label: string; color: string; values: number[]; dashed?: boolean };

function LineChart({
  series,
  labels,
  height = 160,
  yFormat,
}: {
  series: Series[];
  labels: string[];
  height?: number;
  yFormat?: (n: number) => string;
}) {
  const width = 520;
  const padL = 8;
  const padR = 8;
  const padT = 10;
  const padB = 22;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const n = labels.length;
  const x = (i: number) => padL + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const y = (v: number) => padT + innerH - (v / max) * innerH;

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label="Trend chart"
      >
        {/* gridlines */}
        {[0, 0.25, 0.5, 0.75, 1].map((g) => (
          <line
            key={g}
            x1={padL}
            x2={width - padR}
            y1={padT + innerH - g * innerH}
            y2={padT + innerH - g * innerH}
            stroke="currentColor"
            className="text-border"
            strokeWidth={0.5}
          />
        ))}
        {series.map((s) => {
          const d = s.values
            .map((v, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
            .join(" ");
          return (
            <g key={s.label}>
              <path
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "4 3" : undefined}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={2.4} fill={s.color} />
              ))}
            </g>
          );
        })}
        {/* x labels */}
        {labels.map((l, i) => (
          <text
            key={i}
            x={x(i)}
            y={height - 6}
            textAnchor="middle"
            className="fill-text-subtle"
            fontSize={9}
          >
            {l}
          </text>
        ))}
      </svg>
      {/* legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2">
        {series.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[11px] text-text-muted">
            <span
              className="inline-block h-2 w-3 rounded-sm"
              style={{
                background: s.dashed ? "transparent" : s.color,
                borderTop: s.dashed ? `2px dashed ${s.color}` : undefined,
              }}
            />
            {s.label}
            {yFormat && (
              <span className="text-text-subtle tabular-nums">
                · {yFormat(s.values.reduce((a, b) => a + b, 0))}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// "Cindy says" deterministic bullets block
// ---------------------------------------------------------------------------

function CindySays({ bullets }: { bullets: string[] }) {
  return (
    <div className="rounded-lg border border-accent/20 bg-[color:var(--accent-soft)] p-3">
      <div className="flex items-center gap-1.5 mb-2">
        <Sparkles className="w-3.5 h-3.5 text-accent" />
        <span className="text-[11px] font-bold uppercase tracking-wide text-accent">
          Cindy says
        </span>
      </div>
      <ul className="space-y-1.5">
        {bullets.map((b, i) => (
          <li key={i} className="flex gap-2 text-[12px] text-text leading-snug">
            <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Range picker (shared by all popups)
// ---------------------------------------------------------------------------

function RangePicker({
  value,
  onChange,
}: {
  value: RangeKey;
  onChange: (r: RangeKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(RANGE_LABEL) as RangeKey[]).map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onChange(r)}
          className={cn(
            "px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors border",
            value === r
              ? "bg-accent text-accent-ink border-accent"
              : "bg-surface text-text-muted border-border hover:bg-surface-raised",
          )}
        >
          {RANGE_LABEL[r]}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main dashboard
// ---------------------------------------------------------------------------

type CategoryFilter = string | null; // null = all
type UrgencyFilter = "high" | "medium" | "low" | null;
type PayerFilter = string | null;
type DateFilter = { from: string; to: string } | null;

export function DenialsDashboard({
  rows,
  categoryStats,
  payerStats,
  totalDenials,
  totalDollars,
  highUrgencyCount,
  recoveryTargetCents,
  recoveredCents,
}: DenialsDashboardProps) {
  // Shared worklist filters
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>(null);
  const [urgencyFilter, setUrgencyFilter] = useState<UrgencyFilter>(null);
  const [payerFilter, setPayerFilter] = useState<PayerFilter>(null);
  const [dateFilter, setDateFilter] = useState<DateFilter>(null);

  // Open/close for the four filter bubbles
  const [openBubble, setOpenBubble] = useState<
    null | "category" | "date" | "insurance" | "urgency"
  >(null);

  // Popups
  const [atRiskOpen, setAtRiskOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [rootCausePopup, setRootCausePopup] = useState<CategoryStat | null>(null);
  const [payerPopup, setPayerPopup] = useState<PayerStat | null>(null);

  const worklistRef = useRef<HTMLDivElement>(null);

  const scrollToWorklist = () => {
    worklistRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Apply all client-side filters
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (categoryFilter && r.category !== categoryFilter) return false;
      if (urgencyFilter && r.urgency !== urgencyFilter) return false;
      if (payerFilter && r.payerName !== payerFilter) return false;
      if (dateFilter) {
        if (!r.deniedAtISO) return false;
        const d = r.deniedAtISO.slice(0, 10);
        if (dateFilter.from && d < dateFilter.from) return false;
        if (dateFilter.to && d > dateFilter.to) return false;
      }
      return true;
    });
  }, [rows, categoryFilter, urgencyFilter, payerFilter, dateFilter]);

  const anyFilterActive =
    !!categoryFilter || !!urgencyFilter || !!payerFilter || !!dateFilter;

  const clearAll = () => {
    setCategoryFilter(null);
    setUrgencyFilter(null);
    setPayerFilter(null);
    setDateFilter(null);
  };

  const carriers = payerStats.map((p) => p.payer);

  return (
    <>
      {/* ── Hero KPI tiles (EMR-932) ───────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiTile
          label="Open denials"
          value={totalDenials.toString()}
          tone={totalDenials > 0 ? "danger" : "neutral"}
          onClick={scrollToWorklist}
          hint="View worklist"
        />
        <KpiTile
          label="High urgency"
          value={highUrgencyCount.toString()}
          tone={highUrgencyCount > 0 ? "danger" : "success"}
          onClick={() => {
            setUrgencyFilter("high");
            setOpenBubble(null);
            scrollToWorklist();
          }}
          hint="Filter worklist"
        />
        <KpiTile
          label="Total at risk"
          value={formatMoney(totalDollars)}
          tone="warning"
          onClick={() => setAtRiskOpen(true)}
          hint="Open breakdown"
        />
        <KpiTile
          label="Recovery"
          value={formatMoney(recoveredCents)}
          tone="accent"
          hint={`Target ${formatMoney(recoveryTargetCents)}`}
          onClick={() => setRecoveryOpen(true)}
        />
      </div>

      {/* ── Root causes + payer mix ────────────────────────────────────── */}
      {categoryStats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {/* Denial root causes (EMR-947) */}
          <Card tone="raised">
            <CardContent className="pt-5 pb-5">
              <h3 className="font-display text-base text-text">Denial root causes</h3>
              <p className="text-sm text-text-muted mb-4">
                Trends by category. Fix upstream and these stop coming back.
              </p>
              <div className="space-y-3">
                {categoryStats.map((c) => {
                  const pct =
                    totalDenials > 0 ? Math.round((c.count / totalDenials) * 100) : 0;
                  const active = categoryFilter === c.category;
                  return (
                    <div key={c.category} className="group" title={c.description}>
                      <div className="flex items-center justify-between mb-1.5">
                        <button
                          type="button"
                          onClick={() => setRootCausePopup(c)}
                          className={cn(
                            "text-sm text-text capitalize text-left hover:text-accent transition-colors font-medium",
                            active && "text-accent",
                          )}
                        >
                          {c.label}
                        </button>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-text-muted tabular-nums">
                            {formatMoney(c.dollars)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setCategoryFilter(active ? null : c.category);
                              scrollToWorklist();
                            }}
                            aria-pressed={active}
                            className={cn(
                              "text-[10px] rounded-full px-1.5 py-0.5 font-semibold tabular-nums transition-colors",
                              active
                                ? "bg-accent text-accent-ink"
                                : "bg-[color:var(--warning)]/15 text-[color:var(--warning)] hover:bg-[color:var(--warning)]/25",
                            )}
                          >
                            {c.count}
                          </button>
                        </div>
                      </div>
                      <div className="h-1.5 bg-surface-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-danger rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      {/* hover tooltip — plain-language description (EMR-947c) */}
                      <p className="mt-1 text-[10px] text-text-subtle leading-snug max-h-0 overflow-hidden opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-200">
                        {c.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Denial mix by payer (EMR-956) */}
          <Card tone="raised">
            <CardContent className="pt-5 pb-5">
              <h3 className="font-display text-base text-text">Denial mix by payer</h3>
              <p className="text-sm text-text-muted mb-4">Who&apos;s denying you the most.</p>
              {payerStats.length === 0 ? (
                <p className="text-sm text-text-muted text-center py-4">No payer data yet.</p>
              ) : (
                <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
                  {payerStats.map((p) => {
                    const active = payerFilter === p.payer;
                    return (
                      <div
                        key={p.payer}
                        className="flex items-center justify-between"
                        title={`${p.count} denial${p.count === 1 ? "" : "s"} · ${formatMoney(p.dollars)} at risk`}
                      >
                        <button
                          type="button"
                          onClick={() => setPayerPopup(p)}
                          className={cn(
                            "text-sm text-text text-left hover:text-accent transition-colors font-medium",
                            active && "text-accent",
                          )}
                        >
                          {p.payer}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPayerFilter(active ? null : p.payer);
                            scrollToWorklist();
                          }}
                          aria-pressed={active}
                          className={cn(
                            "text-[11px] rounded-full px-2 py-0.5 font-semibold tabular-nums transition-colors",
                            active
                              ? "bg-accent text-accent-ink"
                              : "bg-[color:var(--warning)]/15 text-[color:var(--warning)] hover:bg-[color:var(--warning)]/25",
                          )}
                        >
                          {p.count}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Compact 4-bubble filter bar (EMR-971) ──────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {/* All denials → category dropdown */}
        <FilterBubble
          label={
            categoryFilter
              ? categoryStats.find((c) => c.category === categoryFilter)?.label ??
                "All denials"
              : "All denials"
          }
          active={!!categoryFilter}
          open={openBubble === "category"}
          onToggle={() => setOpenBubble(openBubble === "category" ? null : "category")}
        >
          <div className="p-1 max-h-72 overflow-y-auto w-56">
            <DropdownItem
              label="All categories"
              active={!categoryFilter}
              onClick={() => {
                setCategoryFilter(null);
                setOpenBubble(null);
              }}
            />
            {categoryStats.map((c) => (
              <DropdownItem
                key={c.category}
                label={`${c.label} (${c.count})`}
                active={categoryFilter === c.category}
                onClick={() => {
                  setCategoryFilter(c.category);
                  setOpenBubble(null);
                }}
              />
            ))}
          </div>
        </FilterBubble>

        {/* Date range */}
        <FilterBubble
          label={
            dateFilter
              ? `${dateFilter.from || "…"} → ${dateFilter.to || "…"}`
              : "Date"
          }
          active={!!dateFilter}
          open={openBubble === "date"}
          onToggle={() => setOpenBubble(openBubble === "date" ? null : "date")}
        >
          <div className="p-3 w-64 space-y-2">
            <label className="block text-[11px] font-semibold text-text-muted">
              From
              <input
                type="date"
                value={dateFilter?.from ?? ""}
                onChange={(e) =>
                  setDateFilter({ from: e.target.value, to: dateFilter?.to ?? "" })
                }
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text"
              />
            </label>
            <label className="block text-[11px] font-semibold text-text-muted">
              To
              <input
                type="date"
                value={dateFilter?.to ?? ""}
                onChange={(e) =>
                  setDateFilter({ from: dateFilter?.from ?? "", to: e.target.value })
                }
                className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-xs text-text"
              />
            </label>
            <div className="flex justify-between pt-1">
              <button
                type="button"
                onClick={() => {
                  setDateFilter(null);
                  setOpenBubble(null);
                }}
                className="text-[11px] text-text-subtle hover:text-text font-semibold"
              >
                Clear
              </button>
              <button
                type="button"
                onClick={() => setOpenBubble(null)}
                className="text-[11px] px-2.5 py-1 rounded-lg bg-accent text-accent-ink font-semibold"
              >
                Apply
              </button>
            </div>
          </div>
        </FilterBubble>

        {/* Insurance / carriers */}
        <FilterBubble
          label={payerFilter ?? "Insurance"}
          active={!!payerFilter}
          open={openBubble === "insurance"}
          onToggle={() =>
            setOpenBubble(openBubble === "insurance" ? null : "insurance")
          }
        >
          <div className="p-1 max-h-72 overflow-y-auto w-56">
            <DropdownItem
              label="All carriers"
              active={!payerFilter}
              onClick={() => {
                setPayerFilter(null);
                setOpenBubble(null);
              }}
            />
            {carriers.map((carrier) => (
              <DropdownItem
                key={carrier}
                label={carrier}
                active={payerFilter === carrier}
                onClick={() => {
                  setPayerFilter(carrier);
                  setOpenBubble(null);
                }}
              />
            ))}
          </div>
        </FilterBubble>

        {/* Urgency */}
        <FilterBubble
          label={urgencyFilter ? `${urgencyFilter} urgency` : "Urgency"}
          active={!!urgencyFilter}
          open={openBubble === "urgency"}
          onToggle={() => setOpenBubble(openBubble === "urgency" ? null : "urgency")}
        >
          <div className="p-1 w-44">
            <DropdownItem
              label="All urgencies"
              active={!urgencyFilter}
              onClick={() => {
                setUrgencyFilter(null);
                setOpenBubble(null);
              }}
            />
            {(["high", "medium", "low"] as const).map((u) => (
              <DropdownItem
                key={u}
                label={`${u[0].toUpperCase()}${u.slice(1)}`}
                active={urgencyFilter === u}
                onClick={() => {
                  setUrgencyFilter(u);
                  setOpenBubble(null);
                }}
              />
            ))}
          </div>
        </FilterBubble>

        {anyFilterActive && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-medium text-text-muted hover:text-text transition-colors"
          >
            <X className="w-3 h-3" />
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-text-subtle tabular-nums">
          {filtered.length} of {rows.length}
        </span>
      </div>

      {/* ── Worklist ───────────────────────────────────────────────────── */}
      <div id="denial-worklist" ref={worklistRef} className="scroll-mt-6">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-10 text-center">
            <p className="text-sm font-semibold text-text">No denials in this view</p>
            <p className="text-xs text-text-muted mt-1">
              {anyFilterActive
                ? "Try clearing filters to see more claims."
                : "When payers deny claims, they'll show up here classified and ready to work."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <DenialCard
                key={r.id}
                urgency={r.urgency}
                urgencyTone={r.urgencyTone}
                patientId={r.patientId}
                patientFirstName={r.patientFirstName}
                patientLastName={r.patientLastName}
                serviceDateLabel={r.serviceDateLabel}
                payerName={r.payerName}
                claimNumber={r.claimNumber}
                deniedRelative={r.deniedRelative}
                billedLabel={r.billedLabel}
                triageLabel={r.triageLabel}
                triageCategory={r.triageCategory}
                triageDescription={r.triageDescription}
                denialReason={r.denialReason}
                suggestedActionLabel={r.suggestedActionLabel}
                timeline={r.timeline}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Total at risk popup (EMR-932) ──────────────────────────────── */}
      <AtRiskPopup
        open={atRiskOpen}
        onClose={() => setAtRiskOpen(false)}
        totalDollars={totalDollars}
        categoryStats={categoryStats}
      />

      {/* ── Recovery popup (EMR-932 + EMR-935) ─────────────────────────── */}
      <RecoveryPopup
        open={recoveryOpen}
        onClose={() => setRecoveryOpen(false)}
        recoveryTargetCents={recoveryTargetCents}
        recoveredCents={recoveredCents}
      />

      {/* ── Root-cause popup (EMR-947b) ────────────────────────────────── */}
      <RootCausePopup
        stat={rootCausePopup}
        onClose={() => setRootCausePopup(null)}
        totalDenials={totalDenials}
      />

      {/* ── Payer popup (EMR-956b + EMR-965 benchmarks) ────────────────── */}
      <PayerPopup
        stat={payerPopup}
        onClose={() => setPayerPopup(null)}
        totalDenials={totalDenials}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// KPI tile (clickable)
// ---------------------------------------------------------------------------

function KpiTile({
  label,
  value,
  tone,
  hint,
  onClick,
}: {
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger" | "accent";
  hint?: string;
  onClick: () => void;
}) {
  const colors: Record<string, string> = {
    neutral: "text-text",
    success: "text-success",
    warning: "text-[color:var(--warning)]",
    danger: "text-danger",
    accent: "text-accent",
  };
  return (
    <button type="button" onClick={onClick} className="text-left group">
      <Card
        tone="raised"
        className="h-full transition-all group-hover:border-accent/40 group-hover:shadow-md cursor-pointer"
      >
        <CardContent className="pt-5 pb-5">
          <p className={`font-display text-3xl tabular-nums ${colors[tone]}`}>{value}</p>
          <p className="text-xs text-text-muted mt-1">{label}</p>
          {hint && (
            <p className="text-[10px] text-text-subtle mt-1 group-hover:text-accent transition-colors">
              {hint} →
            </p>
          )}
        </CardContent>
      </Card>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Filter bubble (button + popover)
// ---------------------------------------------------------------------------

function FilterBubble({
  label,
  active,
  open,
  onToggle,
  children,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium capitalize transition-all border",
          active
            ? "bg-accent text-accent-ink border-accent shadow-sm"
            : "bg-surface-muted text-text-muted border-border hover:bg-surface-raised",
        )}
      >
        {label}
        <ChevronDown
          className={cn("w-3.5 h-3.5 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="absolute z-30 mt-1.5 rounded-xl border border-border bg-bg shadow-xl">
          {children}
        </div>
      )}
    </div>
  );
}

function DropdownItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full text-left px-2.5 py-1.5 rounded-lg text-xs capitalize transition-colors",
        active
          ? "bg-accent text-accent-ink font-semibold"
          : "text-text hover:bg-surface-muted",
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Popups
// ---------------------------------------------------------------------------

function AtRiskPopup({
  open,
  onClose,
  totalDollars,
  categoryStats,
}: {
  open: boolean;
  onClose: () => void;
  totalDollars: number;
  categoryStats: CategoryStat[];
}) {
  const [range, setRange] = useState<RangeKey>("6m");
  const months = RANGE_MONTHS[range];
  const labels = monthLabels(months);
  const series: Series[] = [
    {
      label: "Dollars at risk",
      color: "var(--warning)",
      values: monthlySeries("at-risk-dollars", months, totalDollars),
    },
  ];
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      placement="center"
      maxWidth="max-w-2xl"
      eyebrow="Denials"
      title="Total at risk"
      description="Outstanding billed dollars tied up in denied/appealed claims."
    >
      <div className="px-6 py-5 space-y-4">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-3xl text-[color:var(--warning)] tabular-nums">
            {formatMoney(totalDollars)}
          </span>
          <span className="text-xs text-text-muted">across all open denials</span>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-text-muted mb-2">
            Adjust view (time / date / amount)
          </p>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <LineChart series={series} labels={labels} yFormat={formatMoney} />
        <div className="rounded-lg border border-border p-3">
          <p className="text-[11px] font-semibold text-text-muted mb-2">By root cause</p>
          <div className="space-y-1.5">
            {categoryStats.slice(0, 5).map((c) => (
              <div key={c.category} className="flex justify-between text-xs">
                <span className="capitalize text-text">{c.label}</span>
                <span className="tabular-nums text-text-muted">{formatMoney(c.dollars)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function RecoveryPopup({
  open,
  onClose,
  recoveryTargetCents,
  recoveredCents,
}: {
  open: boolean;
  onClose: () => void;
  recoveryTargetCents: number;
  recoveredCents: number;
}) {
  const [range, setRange] = useState<RangeKey>("6m");
  const months = RANGE_MONTHS[range];
  const labels = monthLabels(months);
  // EMR-935 — graph BOTH target and actual recovered series together.
  const series: Series[] = [
    {
      label: "Recovery target",
      color: "var(--accent)",
      values: monthlySeries("recovery-target", months, recoveryTargetCents),
      dashed: true,
    },
    {
      label: "Actual recovered",
      color: "var(--success)",
      values: monthlySeries("recovery-actual", months, recoveredCents),
    },
  ];
  const pct =
    recoveryTargetCents > 0
      ? Math.round((recoveredCents / recoveryTargetCents) * 100)
      : 0;
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      placement="center"
      maxWidth="max-w-2xl"
      eyebrow="Denials"
      title="Recovery"
      description="Target vs actual dollars recovered from overturned appeals."
    >
      <div className="px-6 py-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3">
            <p className="text-[10px] uppercase font-bold text-text-subtle">Target</p>
            <p className="font-display text-2xl text-accent tabular-nums">
              {formatMoney(recoveryTargetCents)}
            </p>
            <p className="text-[10px] text-text-subtle mt-0.5">60% baseline rate</p>
          </div>
          <div className="rounded-lg border border-border p-3">
            <p className="text-[10px] uppercase font-bold text-text-subtle">
              Actual recovered
            </p>
            <p className="font-display text-2xl text-success tabular-nums">
              {formatMoney(recoveredCents)}
            </p>
            <p className="text-[10px] text-text-subtle mt-0.5">{pct}% of target</p>
          </div>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-text-muted mb-2">
            Adjust view (time / date / amount)
          </p>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <LineChart series={series} labels={labels} yFormat={formatMoney} />
        <CindySays
          bullets={[
            pct >= 60
              ? `Recovery is tracking at ${pct}% of target — appeal throughput is healthy.`
              : `Recovery is at ${pct}% of target; prioritize high-dollar overturnable denials to close the gap.`,
            "Overturned medical-necessity appeals carry the largest per-claim recovery — staff them first.",
            "Most months show recovered dollars trailing the target line by 2-3 weeks (appeal decision lag).",
          ]}
        />
      </div>
    </ModalShell>
  );
}

function RootCausePopup({
  stat,
  onClose,
  totalDenials,
}: {
  stat: CategoryStat | null;
  onClose: () => void;
  totalDenials: number;
}) {
  const [range, setRange] = useState<RangeKey>("6m");
  if (!stat) return null;
  const months = RANGE_MONTHS[range];
  const labels = monthLabels(months);
  const series: Series[] = [
    {
      label: `${stat.label} — denials`,
      color: "var(--danger)",
      values: monthlySeries(`rc-${stat.category}`, months, stat.count * 4),
    },
  ];
  const pct = totalDenials > 0 ? Math.round((stat.count / totalDenials) * 100) : 0;
  return (
    <ModalShell
      open={!!stat}
      onClose={onClose}
      placement="center"
      maxWidth="max-w-2xl"
      eyebrow="Root cause"
      title={stat.label}
      description={stat.description}
    >
      <div className="px-6 py-5 space-y-4">
        <div className="flex flex-wrap gap-4">
          <Stat label="Denials" value={stat.count.toString()} />
          <Stat label="At risk" value={formatMoney(stat.dollars)} />
          <Stat label="Share of denials" value={`${pct}%`} />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-text-muted mb-2">Date range</p>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <LineChart series={series} labels={labels} />
        <CindySays bullets={rootCauseBullets(stat, pct)} />
      </div>
    </ModalShell>
  );
}

function PayerPopup({
  stat,
  onClose,
  totalDenials,
}: {
  stat: PayerStat | null;
  onClose: () => void;
  totalDenials: number;
}) {
  const [range, setRange] = useState<RangeKey>("6m");
  if (!stat) return null;
  const months = RANGE_MONTHS[range];
  const labels = monthLabels(months);
  const base = stat.count * 4;
  // EMR-956 base series + EMR-965 deterministic synthetic benchmark overlays.
  const series: Series[] = [
    {
      label: `${stat.payer} — your denials`,
      color: "var(--danger)",
      values: monthlySeries(`payer-${stat.payer}`, months, base),
    },
    {
      label: "Same-specialty peers (synthetic)",
      color: "var(--accent)",
      values: monthlySeries(`peer-spec-${stat.payer}`, months, Math.round(base * 0.85)),
      dashed: true,
    },
    {
      label: "All providers (synthetic)",
      color: "#64748b",
      values: monthlySeries(`peer-all-${stat.payer}`, months, Math.round(base * 0.7)),
      dashed: true,
    },
    {
      label: "Age/demographic cohort (synthetic)",
      color: "#a855f7",
      values: monthlySeries(`peer-demo-${stat.payer}`, months, Math.round(base * 0.9)),
      dashed: true,
    },
  ];
  // EMR-965 — $ lost vs $ on-hold benchmark (separate $ chart).
  const dollarSeries: Series[] = [
    {
      label: "$ lost (written off)",
      color: "var(--danger)",
      values: monthlySeries(`payer-lost-${stat.payer}`, months, Math.round(stat.dollars * 0.4)),
    },
    {
      label: "$ on-hold (in appeal)",
      color: "var(--warning)",
      values: monthlySeries(`payer-hold-${stat.payer}`, months, Math.round(stat.dollars * 0.6)),
    },
  ];
  const pct = totalDenials > 0 ? Math.round((stat.count / totalDenials) * 100) : 0;
  return (
    <ModalShell
      open={!!stat}
      onClose={onClose}
      placement="center"
      maxWidth="max-w-2xl"
      eyebrow="Payer"
      title={stat.payer}
      description="Denial volume vs comparative benchmarks."
    >
      <div className="px-6 py-5 space-y-4">
        <div className="flex flex-wrap gap-4">
          <Stat label="Denials" value={stat.count.toString()} />
          <Stat label="At risk" value={formatMoney(stat.dollars)} />
          <Stat label="Share of denials" value={`${pct}%`} />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-text-muted mb-2">Date range</p>
          <RangePicker value={range} onChange={setRange} />
        </div>
        <div>
          <p className="text-[11px] font-semibold text-text-muted mb-1.5">
            Provider vs peer benchmarks
          </p>
          <LineChart series={series} labels={labels} />
          <p className="text-[10px] text-text-subtle mt-1 italic">
            Benchmark series are synthetic illustrative data (no cross-org source).
          </p>
        </div>
        <div>
          <p className="text-[11px] font-semibold text-text-muted mb-1.5">
            Dollars lost vs on-hold
          </p>
          <LineChart series={dollarSeries} labels={labels} yFormat={formatMoney} />
        </div>
        <CindySays bullets={payerBullets(stat, pct)} />
      </div>
    </ModalShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase font-bold text-text-subtle">{label}</p>
      <p className="font-display text-xl text-text tabular-nums">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Deterministic "Cindy says" bullet generators
// ---------------------------------------------------------------------------

function rootCauseBullets(stat: CategoryStat, pct: number): string[] {
  const trend = seededUnit(stat.category, 7) > 0.5 ? "trending up" : "trending down";
  const fixHint: Record<string, string> = {
    authorization:
      "Wire prior-auth checks into scheduling so no service goes out without an auth on file.",
    eligibility:
      "Run real-time eligibility at check-in to catch termed policies before the visit.",
    medical_necessity:
      "Attach the LCD/NCD-supporting note up front; most overturns hinge on documentation.",
    coding: "Add a pre-bill scrubber rule for the offending CPT/ICD pairings.",
    modifier: "Auto-suggest modifier 25/59 when bundling-prone code pairs are billed together.",
    bundling: "Review NCCI edits at charge entry to split or modifier-flag bundled codes.",
    timely_filing: "Tighten the submit-by clock; flag claims approaching the filing window.",
    registration: "Validate member-ID/DOB against the payer roster at registration.",
    coordination_of_benefits: "Confirm primary/secondary order during intake to avoid COB rejects.",
    duplicate: "Check ERA history before resubmitting to avoid duplicate rejections.",
    non_covered_service: "Capture an ABN at scheduling so non-covered services bill cleanly to patient.",
    credentialing: "Track payer enrollment status per rendering provider; block billing if lapsed.",
  };
  return [
    `${stat.label} accounts for ${pct}% of open denials (${stat.count} claims, ${formatMoney(stat.dollars)} at risk).`,
    `These denials are ${trend} over the selected window.`,
    fixHint[stat.category] ??
      "Route a sample to a senior biller to identify the upstream process gap.",
    "Fixing the upstream cause prevents the same denial from recurring next cycle.",
  ];
}

function payerBullets(stat: PayerStat, pct: number): string[] {
  const vsPeer = seededUnit(stat.payer, 3) > 0.5;
  return [
    `${stat.payer} drives ${pct}% of your denials (${stat.count} claims, ${formatMoney(stat.dollars)} at risk).`,
    vsPeer
      ? `Your denial rate with ${stat.payer} runs above the same-specialty benchmark — worth a payer escalation.`
      : `Your denial rate with ${stat.payer} is near the same-specialty benchmark.`,
    "Most of the at-risk dollars sit in the on-hold (in-appeal) bucket — push appeals to close them.",
    `Consider a payer-specific edit set for ${stat.payer}'s top denial reason to cut volume.`,
  ];
}
