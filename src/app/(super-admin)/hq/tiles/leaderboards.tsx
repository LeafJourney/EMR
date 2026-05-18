import Link from "next/link";
import type { TopPracticeRow } from "../types";
import { MomPill } from "./mom-pill";
import { formatCount, formatUSDCents } from "./format";

type Metric = "claims" | "billed" | "patientGrowth";

const HEADINGS: Record<Metric, string> = {
  claims: "Top by claims volume",
  billed: "Top by revenue",
  patientGrowth: "Top by patient growth",
};

const VALUE_LABELS: Record<Metric, string> = {
  claims: "Claims",
  billed: "Billed",
  patientGrowth: "New patients",
};

function formatMetric(metric: Metric, raw: number): string {
  if (metric === "billed") return formatUSDCents(raw);
  return formatCount(raw);
}

function Leaderboard({ metric, rows }: { metric: Metric; rows: TopPracticeRow[] }) {
  return (
    <section
      aria-labelledby={`lb-${metric}-heading`}
      className="rounded-2xl border border-border/70 bg-surface px-6 py-5"
    >
      <header className="flex items-baseline justify-between mb-4">
        <h3
          id={`lb-${metric}-heading`}
          className="text-[12px] uppercase tracking-[0.14em] text-text-subtle"
        >
          {HEADINGS[metric]}
        </h3>
        <span className="text-[11px] text-text-subtle">MTD</span>
      </header>
      {rows.length === 0 ? (
        <p className="text-sm text-text-subtle">No data yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((row, idx) => (
            <li key={`${metric}-${row.organizationId}`}>
              <Link
                href={`/practices/${row.organizationId}`}
                className="grid grid-cols-[1.25rem_1fr_auto_4.5rem] items-baseline gap-3 px-2 py-1.5 -mx-2 rounded-lg hover:bg-surface-muted/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span className="text-[11px] text-text-subtle tabular-nums">
                  {idx + 1}
                </span>
                <span className="text-sm text-text truncate" title={row.practiceName}>
                  {row.practiceName}
                </span>
                <span className="font-display text-base text-text tabular-nums">
                  {formatMetric(metric, row.metric)}
                </span>
                <span className="justify-self-end">
                  <MomPill pct={row.momDelta} />
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}
      <p className="sr-only">{`${VALUE_LABELS[metric]} for the current month.`}</p>
    </section>
  );
}

export function Leaderboards({
  topByClaims,
  topByRevenue,
  topByPatientGrowth,
}: {
  topByClaims: TopPracticeRow[];
  topByRevenue: TopPracticeRow[];
  topByPatientGrowth: TopPracticeRow[];
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      <Leaderboard metric="claims" rows={topByClaims} />
      <Leaderboard metric="billed" rows={topByRevenue} />
      <Leaderboard metric="patientGrowth" rows={topByPatientGrowth} />
    </div>
  );
}
