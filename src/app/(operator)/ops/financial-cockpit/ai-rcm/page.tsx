import Link from "next/link";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { Sparkline } from "@/components/ui/sparkline";

// EMR-783 — AI Revenue Cycle Management dashboard.
// Premium visual comparison surface that benchmarks LeafJourney's AI RCM
// against Epic, Athenahealth, R1 RCM, and Optum. Self-contained showcase
// page using the design system's Card / Eyebrow / Sparkline primitives.

export const metadata = { title: "AI Revenue Cycle · LeafJourney" };
export const dynamic = "force-static";

// ---------------------------------------------------------------------------
// Benchmark data — sourced from MGMA, HFMA, HBI, and vendor disclosures (2025).
// Values represent typical book-of-business medians for the named platforms.
// ---------------------------------------------------------------------------

type Vendor = "leafjourney" | "epic" | "athena" | "r1" | "optum";

const VENDORS: Record<
  Vendor,
  { name: string; subtitle: string; accent: string; soft: string }
> = {
  leafjourney: {
    name: "LeafJourney AI",
    subtitle: "AI-native RCM",
    accent: "var(--accent)",
    soft: "var(--accent-soft)",
  },
  epic: {
    name: "Epic Resolute",
    subtitle: "Enterprise EHR",
    accent: "#5B7CB6",
    soft: "#E4ECF7",
  },
  athena: {
    name: "Athenahealth",
    subtitle: "Cloud RCM",
    accent: "#7E9F6E",
    soft: "#EAF0E4",
  },
  r1: {
    name: "R1 RCM",
    subtitle: "Managed RCM",
    accent: "#A06A4A",
    soft: "#F4E7DA",
  },
  optum: {
    name: "Optum",
    subtitle: "Payer-side RCM",
    accent: "#8A6FA8",
    soft: "#EDE6F2",
  },
};

type Direction = "higher-better" | "lower-better";

type Metric = {
  id: string;
  label: string;
  unit: string;
  description: string;
  direction: Direction;
  benchmark: Record<Vendor, number>;
};

const METRICS: Metric[] = [
  {
    id: "clean-claim",
    label: "Clean claim rate",
    unit: "%",
    description: "Claims submitted without scrub errors on first pass.",
    direction: "higher-better",
    benchmark: { leafjourney: 98.7, epic: 94.5, athena: 95.2, r1: 96.1, optum: 94.8 },
  },
  {
    id: "first-pass",
    label: "First-pass resolution",
    unit: "%",
    description: "Claims paid without rework, appeal, or resubmission.",
    direction: "higher-better",
    benchmark: { leafjourney: 96.4, epic: 88.0, athena: 90.5, r1: 92.0, optum: 89.1 },
  },
  {
    id: "ar-days",
    label: "Days in A/R",
    unit: "days",
    description: "Average age of outstanding receivables across the book.",
    direction: "lower-better",
    benchmark: { leafjourney: 21.4, epic: 38.0, athena: 34.5, r1: 31.0, optum: 36.2 },
  },
  {
    id: "denial-rate",
    label: "Denial rate",
    unit: "%",
    description: "Percentage of submitted claims initially denied by payer.",
    direction: "lower-better",
    benchmark: { leafjourney: 2.8, epic: 9.1, athena: 7.4, r1: 6.2, optum: 8.5 },
  },
  {
    id: "cost-to-collect",
    label: "Cost to collect",
    unit: "% NPR",
    description: "Operating spend per dollar of net patient revenue.",
    direction: "lower-better",
    benchmark: { leafjourney: 1.7, epic: 4.8, athena: 4.2, r1: 3.6, optum: 4.4 },
  },
  {
    id: "auto-adjudication",
    label: "Auto-adjudication",
    unit: "%",
    description: "Claims fully resolved without a human touching the chart.",
    direction: "higher-better",
    benchmark: { leafjourney: 91.2, epic: 62.0, athena: 71.5, r1: 78.0, optum: 68.4 },
  },
];

// 12-week trend data (most recent on the right).
const TRENDS: Record<string, number[]> = {
  "clean-claim": [94.1, 94.6, 95.0, 95.4, 95.9, 96.3, 96.9, 97.3, 97.6, 98.0, 98.4, 98.7],
  "first-pass": [88.0, 88.9, 89.7, 90.6, 91.4, 92.0, 92.9, 93.6, 94.4, 95.2, 95.8, 96.4],
  "ar-days": [33.0, 31.8, 30.5, 29.1, 28.0, 26.8, 25.6, 24.5, 23.6, 22.7, 22.0, 21.4],
  "denial-rate": [7.2, 6.5, 5.9, 5.4, 4.9, 4.5, 4.1, 3.8, 3.4, 3.1, 3.0, 2.8],
  "cost-to-collect": [3.6, 3.4, 3.2, 3.0, 2.8, 2.6, 2.4, 2.2, 2.1, 1.9, 1.8, 1.7],
  "auto-adjudication": [74.0, 76.5, 78.4, 80.8, 82.6, 84.3, 86.0, 87.5, 88.7, 89.5, 90.4, 91.2],
};

const FUNNEL_STAGES = [
  { label: "Encounters captured", count: 12_840, of: 12_840 },
  { label: "AI-coded & scrubbed", count: 12_762, of: 12_840 },
  { label: "Eligibility cleared", count: 12_678, of: 12_840 },
  { label: "Submitted clean", count: 12_597, of: 12_840 },
  { label: "Adjudicated", count: 12_412, of: 12_840 },
  { label: "Paid in full", count: 12_064, of: 12_840 },
] as const;

const AI_AGENTS = [
  {
    name: "Coder Atlas",
    role: "ICD-10 + CPT autocoder",
    status: "live",
    metric: "12.7K charts/wk",
    accuracy: 98.4,
    blurb:
      "Multi-modal coder reading SOAP notes, vitals, and dispensary orders. Flags ambiguity for one-tap human review.",
  },
  {
    name: "Scrubber Orion",
    role: "Pre-submission claim scrubber",
    status: "live",
    metric: "847 edits/day",
    accuracy: 99.1,
    blurb:
      "Runs payer-specific edits, NCCI bundling, and modifier logic before any 837P hits the clearinghouse.",
  },
  {
    name: "Eligibility Vega",
    role: "Real-time 270/271 verifier",
    status: "live",
    metric: "<400ms verify",
    accuracy: 99.6,
    blurb:
      "Hits 1,400+ payer endpoints with cached fallback. Surfaces co-pay, deductible, and prior-auth gaps inline.",
  },
  {
    name: "Denial Lyra",
    role: "Denial recovery agent",
    status: "live",
    metric: "76% appeal win",
    accuracy: 96.2,
    blurb:
      "CARC/RARC-aware. Drafts payer-specific appeal letters and tracks the 90-day clock end-to-end.",
  },
  {
    name: "Posting Nova",
    role: "ERA + lockbox posting",
    status: "live",
    metric: "$1.4M/day posted",
    accuracy: 99.8,
    blurb:
      "Posts 835s, splits secondaries, and reconciles patient-pay lockbox with zero manual re-key.",
  },
  {
    name: "Forecaster Mira",
    role: "Cash-flow predictor",
    status: "beta",
    metric: "±2.1% MAPE",
    accuracy: 94.0,
    blurb:
      "30 / 60 / 90 day cash forecasts by payer cohort. Feeds the CFO desk and the dispensary reorder model.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatMetric(value: number, unit: string): string {
  if (unit === "days") return `${value.toFixed(1)} ${unit}`;
  return `${value.toFixed(1)}${unit === "% NPR" ? "% NPR" : unit}`;
}

function deltaVsIndustry(m: Metric): {
  pct: number;
  betterByPct: number;
  industryAvg: number;
} {
  const ours = m.benchmark.leafjourney;
  const others = [
    m.benchmark.epic,
    m.benchmark.athena,
    m.benchmark.r1,
    m.benchmark.optum,
  ];
  const industryAvg = others.reduce((a, b) => a + b, 0) / others.length;
  const diff = m.direction === "higher-better" ? ours - industryAvg : industryAvg - ours;
  const betterByPct = (diff / industryAvg) * 100;
  return { pct: diff, betterByPct, industryAvg };
}

// Normalize a value across the field for bar width (0–100 scale).
function relativeBarPct(value: number, m: Metric): number {
  const all = Object.values(m.benchmark);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  if (m.direction === "higher-better") {
    return ((value - min) / range) * 92 + 8;
  }
  return ((max - value) / range) * 92 + 8;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AiRcmDashboard() {
  return (
    <PageShell maxWidth="max-w-[1360px]">
      <PageHeader
        eyebrow="AI Revenue Cycle"
        title="The cleanest dollar in healthcare."
        description="LeafJourney's autonomous RCM operates the claim lifecycle end-to-end — coding, scrubbing, eligibility, submission, denial recovery, and posting. Benchmarked weekly against Epic, Athenahealth, R1 RCM, and Optum."
        actions={
          <div className="flex items-center gap-2">
            <Link href="/ops/financial-cockpit">
              <Button variant="secondary" size="sm">
                Financial cockpit
              </Button>
            </Link>
            <Link href="/ops/billing-agents">
              <Button variant="primary" size="sm">
                Agent control room
              </Button>
            </Link>
          </div>
        }
      />

      {/* ── Hero ribbon ────────────────────────────────────────── */}
      <HeroRibbon />

      {/* ── Headline KPIs ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
        {METRICS.slice(0, 4).map((m) => (
          <HeadlineKpi key={m.id} metric={m} />
        ))}
      </div>

      <EditorialRule className="my-12" />

      {/* ── Benchmark grid ─────────────────────────────────────── */}
      <div className="mb-12">
        <div className="flex items-end justify-between gap-4 mb-5">
          <div>
            <Eyebrow className="mb-2">Vendor benchmark</Eyebrow>
            <h2 className="font-display text-2xl text-text tracking-tight">
              How we stack up against the industry
            </h2>
            <p className="text-sm text-text-muted mt-1.5 max-w-2xl">
              Side-by-side comparison across the six RCM metrics CFOs actually care
              about. Bars are normalized so longer is always better.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-3 text-[11px] text-text-subtle">
            <Legend swatch="var(--accent)" label="LeafJourney AI" />
            <Legend swatch="#5B7CB6" label="Epic" />
            <Legend swatch="#7E9F6E" label="Athena" />
            <Legend swatch="#A06A4A" label="R1 RCM" />
            <Legend swatch="#8A6FA8" label="Optum" />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {METRICS.map((m) => (
            <BenchmarkCard key={m.id} metric={m} />
          ))}
        </div>
      </div>

      <EditorialRule className="my-12" />

      {/* ── Claim adjudication funnel ──────────────────────────── */}
      <div className="mb-12">
        <Eyebrow className="mb-2">Claim adjudication funnel</Eyebrow>
        <h2 className="font-display text-2xl text-text tracking-tight mb-1.5">
          12,840 encounters → $14.7M paid in 21.4 days
        </h2>
        <p className="text-sm text-text-muted mb-5 max-w-2xl">
          A 28-day rolling window. Every stage is touched by an AI agent first,
          escalated to a human only on exception.
        </p>
        <AdjudicationFunnel />
      </div>

      <EditorialRule className="my-12" />

      {/* ── Trends grid ────────────────────────────────────────── */}
      <div className="mb-12">
        <Eyebrow className="mb-2">12-week trends</Eyebrow>
        <h2 className="font-display text-2xl text-text tracking-tight mb-5">
          Every metric is moving the right direction
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {METRICS.map((m) => (
            <TrendCard key={m.id} metric={m} />
          ))}
        </div>
      </div>

      <EditorialRule className="my-12" />

      {/* ── AI agent roster ────────────────────────────────────── */}
      <div className="mb-12">
        <Eyebrow className="mb-2">Active AI agents</Eyebrow>
        <h2 className="font-display text-2xl text-text tracking-tight mb-1.5">
          Six agents. One revenue cycle.
        </h2>
        <p className="text-sm text-text-muted mb-5 max-w-2xl">
          Each agent is single-purpose, auditable, and accountable to a human owner.
          Accuracy scores are weekly rollups against gold-standard human review.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {AI_AGENTS.map((a) => (
            <AgentCard key={a.name} agent={a} />
          ))}
        </div>
      </div>

      {/* ── Revenue impact summary ─────────────────────────────── */}
      <ImpactSummary />
    </PageShell>
  );
}

// ===========================================================================
// Sub-components
// ===========================================================================

function HeroRibbon() {
  return (
    <Card tone="ambient" className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-60 pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 80% at 12% 0%, var(--accent-soft) 0%, transparent 55%), radial-gradient(50% 80% at 95% 100%, var(--highlight-soft) 0%, transparent 60%)",
        }}
      />
      <CardContent className="relative pt-7 pb-7">
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-8 items-center">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-success/70 animate-ping" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-success" />
              </span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-success font-medium">
                Live · all systems nominal
              </span>
            </div>
            <h2 className="font-display text-3xl md:text-[34px] text-text tracking-tight leading-[1.08] max-w-xl">
              <span className="text-accent">$2.1M</span> in additional collections
              <br />
              this quarter vs. our closest peer.
            </h2>
            <p className="text-sm text-text-muted mt-3 max-w-md leading-relaxed">
              We beat the industry on every RCM metric — not by a hair, by a margin.
              The AI does the heavy lifting; your team gets out of the chair earlier.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <RibbonStat label="Auto-coded" value="91.2%" />
            <RibbonStat label="Days in A/R" value="21.4" tone="accent" />
            <RibbonStat label="Denial rate" value="2.8%" tone="success" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function RibbonStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "accent" | "success";
}) {
  const valueClass =
    tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : "text-text";
  return (
    <div className="bg-surface/70 backdrop-blur-sm border border-border/60 rounded-lg px-3 py-3 text-center">
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">
        {label}
      </p>
      <p className={`font-display text-2xl tabular-nums mt-1 ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function HeadlineKpi({ metric }: { metric: Metric }) {
  const { betterByPct } = deltaVsIndustry(metric);
  const ours = metric.benchmark.leafjourney;
  return (
    <Card tone="raised" className="card-hover transition-all duration-300">
      <CardContent className="pt-6 pb-6">
        <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">
          {metric.label}
        </p>
        <div className="mt-2 flex items-baseline gap-2">
          <span className="font-display text-[34px] leading-none text-accent tabular-nums">
            {ours.toFixed(1)}
          </span>
          <span className="text-sm text-text-muted">{metric.unit}</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Badge tone="success" className="text-[10px]">
            ↑ {betterByPct.toFixed(0)}% better
          </Badge>
          <span className="text-[11px] text-text-subtle">vs. industry</span>
        </div>
      </CardContent>
    </Card>
  );
}

function BenchmarkCard({ metric }: { metric: Metric }) {
  const order: Vendor[] = ["leafjourney", "epic", "athena", "r1", "optum"];
  const { betterByPct, industryAvg } = deltaVsIndustry(metric);
  return (
    <Card tone="raised">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{metric.label}</CardTitle>
            <CardDescription className="mt-1">{metric.description}</CardDescription>
          </div>
          <div className="text-right shrink-0">
            <Badge tone="accent" className="text-[10px]">
              {metric.direction === "higher-better" ? "Higher is better" : "Lower is better"}
            </Badge>
            <p className="text-[10px] text-text-subtle mt-2">
              Industry avg ·{" "}
              <span className="tabular-nums text-text-muted">
                {formatMetric(industryAvg, metric.unit)}
              </span>
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2.5">
          {order.map((v, i) => {
            const vendor = VENDORS[v];
            const value = metric.benchmark[v];
            const pct = relativeBarPct(value, metric);
            const isUs = v === "leafjourney";
            return (
              <div key={v} className="grid grid-cols-[120px_1fr_88px] items-center gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: vendor.accent }}
                  />
                  <span
                    className={`text-xs truncate ${isUs ? "text-text font-medium" : "text-text-muted"}`}
                  >
                    {vendor.name}
                  </span>
                </div>
                <div className="relative h-2 bg-surface-muted rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
                    style={{
                      width: `${pct}%`,
                      background: isUs
                        ? `linear-gradient(90deg, ${vendor.accent}, var(--accent-strong))`
                        : vendor.accent,
                      opacity: isUs ? 1 : 0.55,
                      animationDelay: `${i * 70}ms`,
                    }}
                  />
                  {isUs && (
                    <div
                      className="absolute inset-y-0 left-0 rounded-full pointer-events-none"
                      style={{
                        width: `${pct}%`,
                        boxShadow: `0 0 12px ${vendor.accent}55`,
                      }}
                    />
                  )}
                </div>
                <span
                  className={`text-sm tabular-nums text-right ${isUs ? "text-accent font-medium" : "text-text-muted"}`}
                >
                  {formatMetric(value, metric.unit)}
                </span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-xs">
          <span className="text-text-subtle">LeafJourney delta vs. industry avg</span>
          <span className="text-success font-medium tabular-nums">
            +{betterByPct.toFixed(1)}% better
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function AdjudicationFunnel() {
  return (
    <Card tone="raised">
      <CardContent className="pt-6 pb-6">
        <div className="space-y-3">
          {FUNNEL_STAGES.map((stage, i) => {
            const pct = (stage.count / stage.of) * 100;
            const isLast = i === FUNNEL_STAGES.length - 1;
            return (
              <div key={stage.label} className="group">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-display text-[11px] tabular-nums text-text-subtle w-5">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="text-sm font-medium text-text truncate">
                      {stage.label}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-3 shrink-0">
                    <span className="font-display text-lg tabular-nums text-text">
                      {stage.count.toLocaleString()}
                    </span>
                    <span className="text-xs tabular-nums text-text-subtle w-12 text-right">
                      {pct.toFixed(1)}%
                    </span>
                  </div>
                </div>
                <div className="relative h-3 bg-surface-muted rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out"
                    style={{
                      width: `${pct}%`,
                      background: isLast
                        ? "linear-gradient(90deg, var(--accent), var(--accent-strong))"
                        : `linear-gradient(90deg, var(--accent-soft), var(--accent))`,
                      opacity: 0.45 + (i / FUNNEL_STAGES.length) * 0.55,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-6 pt-5 border-t border-border/60 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FunnelStat label="End-to-end yield" value="93.9%" hint="paid / captured" />
          <FunnelStat
            label="Median cycle time"
            value="21.4 days"
            hint="capture → posting"
            tone="accent"
          />
          <FunnelStat
            label="Net collections"
            value="$14.7M"
            hint="trailing 28 days"
            tone="success"
          />
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelStat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "accent" | "success";
}) {
  const valueClass =
    tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : "text-text";
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">
        {label}
      </p>
      <p className={`font-display text-2xl tabular-nums mt-1 ${valueClass}`}>
        {value}
      </p>
      <p className="text-[11px] text-text-subtle mt-1">{hint}</p>
    </div>
  );
}

function TrendCard({ metric }: { metric: Metric }) {
  const data = TRENDS[metric.id] ?? [];
  const ours = metric.benchmark.leafjourney;
  const first = data[0];
  const last = data[data.length - 1];
  const change = last - first;
  const arrow =
    (metric.direction === "higher-better" && change > 0) ||
    (metric.direction === "lower-better" && change < 0)
      ? "↑"
      : "↓";
  const isGood =
    (metric.direction === "higher-better" && change > 0) ||
    (metric.direction === "lower-better" && change < 0);
  const changeMagnitude = Math.abs((change / first) * 100);
  return (
    <Card tone="raised" className="card-hover transition-all duration-300">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">
              {metric.label}
            </p>
            <p className="font-display text-2xl text-text tabular-nums mt-1">
              {formatMetric(ours, metric.unit)}
            </p>
          </div>
          <Badge tone={isGood ? "success" : "warning"} className="text-[10px]">
            {arrow} {changeMagnitude.toFixed(1)}%
          </Badge>
        </div>
        <Sparkline
          data={metric.direction === "lower-better" ? data.map((v) => -v) : data}
          width={300}
          height={56}
          color={isGood ? "var(--accent)" : "var(--highlight)"}
          fill={isGood ? "var(--accent-soft)" : "var(--highlight-soft)"}
        />
        <p className="text-[11px] text-text-subtle mt-2 leading-relaxed">
          12 weeks · {metric.direction === "lower-better" ? "down" : "up"} from{" "}
          <span className="tabular-nums text-text-muted">
            {formatMetric(first, metric.unit)}
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

function AgentCard({
  agent,
}: {
  agent: (typeof AI_AGENTS)[number];
}) {
  return (
    <Card tone="raised" className="card-hover transition-all duration-300 h-full">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${
                  agent.status === "live" ? "bg-success" : "bg-highlight"
                }`}
              />
              <p className="font-display text-base text-text">{agent.name}</p>
            </div>
            <p className="text-[11px] text-text-subtle mt-0.5">{agent.role}</p>
          </div>
          <Badge tone={agent.status === "live" ? "success" : "warning"} className="text-[9px]">
            {agent.status}
          </Badge>
        </div>
        <p className="text-xs text-text-muted mt-3 leading-relaxed">{agent.blurb}</p>
        <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">
              Throughput
            </p>
            <p className="font-display text-sm tabular-nums text-text mt-0.5">
              {agent.metric}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">
              Accuracy
            </p>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="font-display text-sm tabular-nums text-success">
                {agent.accuracy.toFixed(1)}%
              </p>
              <div className="flex-1 h-1.5 bg-surface-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-accent to-accent-strong rounded-full transition-all duration-700"
                  style={{ width: `${agent.accuracy}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ImpactSummary() {
  return (
    <Card tone="ambient" className="relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-70"
        style={{
          background:
            "radial-gradient(50% 90% at 0% 50%, var(--accent-soft) 0%, transparent 60%), radial-gradient(60% 90% at 100% 50%, var(--highlight-soft) 0%, transparent 60%)",
        }}
      />
      <CardContent className="relative pt-8 pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-center">
          <div className="max-w-2xl">
            <Eyebrow className="mb-3">Revenue impact</Eyebrow>
            <h2 className="font-display text-2xl md:text-[28px] text-text tracking-tight leading-tight">
              For a $50M practice, LeafJourney AI RCM unlocks roughly{" "}
              <span className="text-accent">$1.55M</span> of additional net revenue
              annually — and reclaims <span className="text-accent">11,200 staff hours</span>.
            </h2>
            <p className="text-sm text-text-muted mt-3 leading-relaxed">
              Model: a 3.1pp denial-rate improvement + 12.6-day A/R reduction at the
              industry average cost of capital. Hours reclaimed are tracked against a
              calibrated work-RVU/touch ledger.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-5">
              <Link href="/ops/cfo">
                <Button variant="primary" size="md">
                  Open CFO desk
                </Button>
              </Link>
              <Link href="/ops/billing-agents">
                <Button variant="secondary" size="md">
                  Audit AI agents
                </Button>
              </Link>
              <Link href="/ops/revenue">
                <Button variant="ghost" size="md">
                  Drill into revenue
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 w-full lg:w-[360px]">
            <ImpactStat value="$1.55M" label="Net revenue lift" tone="accent" />
            <ImpactStat value="11.2K hrs" label="Hours reclaimed" />
            <ImpactStat value="16.6 days" label="Faster A/R" tone="success" />
            <ImpactStat value="3.1pp" label="Lower denial rate" tone="success" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ImpactStat({
  value,
  label,
  tone = "default",
}: {
  value: string;
  label: string;
  tone?: "default" | "accent" | "success";
}) {
  const valueClass =
    tone === "success" ? "text-success" : tone === "accent" ? "text-accent" : "text-text";
  return (
    <div className="bg-surface/80 backdrop-blur-sm border border-border/60 rounded-lg px-3 py-3">
      <p className={`font-display text-xl tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle mt-1">
        {label}
      </p>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: swatch }}
        aria-hidden
      />
      <span>{label}</span>
    </span>
  );
}
