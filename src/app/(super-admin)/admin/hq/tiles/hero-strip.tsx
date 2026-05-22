import Link from "next/link";
import type { FleetCounts, FleetDailyPoint } from "../types";
import { momDelta } from "../types";
import { MomPill } from "./mom-pill";
import { formatCount, sparklinePath } from "./format";

const SPARK_W = 80;
const SPARK_H = 24;

function sumLast(values: number[], n: number): number {
  return values.slice(-n).reduce((a, b) => a + b, 0);
}

function Sparkline({ values }: { values: number[] }) {
  if (values.length === 0) return null;
  const d = sparklinePath(values, SPARK_W, SPARK_H);
  return (
    <svg
      width={SPARK_W}
      height={SPARK_H}
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      role="presentation"
      aria-hidden="true"
      className="text-accent"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tile({
  label,
  value,
  href,
  series,
  momPct,
}: {
  label: string;
  value: string;
  href: string;
  series: number[];
  momPct: number;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-border/70 bg-surface px-7 py-6 shadow-sm transition-transform duration-150 hover:scale-[1.01] focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">{label}</div>
        <MomPill pct={momPct} />
      </div>
      <div className="font-display text-5xl text-text tracking-tight tabular-nums mt-4 leading-none">
        {value}
      </div>
      <div className="mt-5 flex items-end justify-between">
        <span className="text-[11px] text-text-subtle uppercase tracking-[0.14em]">30d</span>
        <Sparkline values={series} />
      </div>
    </Link>
  );
}

function EmptyTile({
  label,
  hint,
  ctaHref,
  ctaLabel,
}: {
  label: string;
  hint: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="block rounded-2xl border border-dashed border-border-strong/60 bg-surface-muted/30 px-7 py-6">
      <div className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">{label}</div>
      <div className="font-display text-5xl text-text-muted tracking-tight tabular-nums mt-4 leading-none">
        —
      </div>
      <p className="mt-4 text-[12px] text-text-muted leading-snug">{hint}</p>
      <Link
        href={ctaHref}
        className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-[0.14em] text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded"
      >
        {ctaLabel} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

export function HeroStrip({
  counts,
  dailySeries,
}: {
  counts: FleetCounts;
  dailySeries: FleetDailyPoint[];
}) {
  // The fleet counts are point-in-time, so we proxy MoM via the trailing-30
  // / prior-30 ratio of new-patient and encounter activity from the daily
  // series — directionally correct, no PHI, free of new queries.
  const newPatients = dailySeries.map((d) => d.newPatients);
  const encounters = dailySeries.map((d) => d.encounters);
  const claims = dailySeries.map((d) => d.claims);

  const patientsMom = momDelta(sumLast(newPatients, 15), sumLast(newPatients.slice(0, -15), 15));
  const providersMom = momDelta(sumLast(encounters, 15), sumLast(encounters.slice(0, -15), 15));
  const practicesMom = momDelta(sumLast(claims, 15), sumLast(claims.slice(0, -15), 15));

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {counts.practicesLive === 0 ? (
        <EmptyTile
          label="Practices live"
          hint="Live practice count appears here once your first practice publishes its configuration."
          ctaHref="/onboarding"
          ctaLabel="Start a practice"
        />
      ) : (
        <Tile
          label="Practices live"
          value={formatCount(counts.practicesLive)}
          href="/practices"
          series={claims}
          momPct={practicesMom}
        />
      )}
      {counts.providersActive === 0 ? (
        <EmptyTile
          label="Providers active"
          hint="Active providers will appear here once clinicians are invited into a practice."
          ctaHref="/admin/console"
          ctaLabel="Manage admins"
        />
      ) : (
        <Tile
          label="Providers active"
          value={formatCount(counts.providersActive)}
          href="/admin/console"
          series={encounters}
          momPct={providersMom}
        />
      )}
      {counts.patientsActive === 0 ? (
        <EmptyTile
          label="Patients active"
          hint="Active patients across the fleet appear here once charts are created."
          ctaHref="/admin/search"
          ctaLabel="Search existing data"
        />
      ) : (
        <Tile
          label="Patients active"
          value={formatCount(counts.patientsActive)}
          href="/practices?focus=patients"
          series={newPatients}
          momPct={patientsMom}
        />
      )}
    </div>
  );
}
