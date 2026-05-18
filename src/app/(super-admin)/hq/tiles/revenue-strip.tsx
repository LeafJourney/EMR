import type { FleetRevenue } from "../types";
import { momDelta } from "../types";
import { MomPill } from "./mom-pill";
import { formatUSDCents } from "./format";

function Tile({
  label,
  subtitle,
  value,
  prevValue,
  pct,
}: {
  label: string;
  subtitle: string;
  value: string;
  prevValue: string;
  pct: number;
}) {
  return (
    <div
      tabIndex={0}
      className="group relative block rounded-2xl border border-border/70 bg-surface px-7 py-6 shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      title={`Prev: ${prevValue}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">{label}</div>
        <MomPill pct={pct} />
      </div>
      <div className="font-display text-3xl md:text-4xl text-text tracking-tight tabular-nums mt-4 leading-none">
        {value}
      </div>
      <div className="mt-3 text-[11px] text-text-subtle leading-snug">{subtitle}</div>
      <div className="pointer-events-none absolute inset-x-7 bottom-3 flex items-center justify-between text-[10px] uppercase tracking-[0.14em] text-text-subtle opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
        <span>Prev</span>
        <span className="tabular-nums text-text-muted">{prevValue}</span>
      </div>
    </div>
  );
}

function PlaceholderTile() {
  return (
    <div
      tabIndex={0}
      className="block rounded-2xl border border-dashed border-border-strong/60 bg-surface-muted/30 px-7 py-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      title="Available after SaaS billing ships (EMR-724)"
      aria-label="ARR placeholder — Available after SaaS billing ships (EMR-724)"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">ARR</div>
      </div>
      <div className="font-display text-3xl md:text-4xl text-text-muted tracking-tight tabular-nums mt-4 leading-none">
        —
      </div>
      <div className="mt-3 text-[11px] text-text-subtle leading-snug">
        Available after SaaS billing ships (EMR-724).
      </div>
    </div>
  );
}

export function RevenueStrip({ revenue }: { revenue: FleetRevenue }) {
  const billedPct = momDelta(revenue.billedCentsMTD, revenue.billedCentsPrevMonth);
  const collectedPct = momDelta(revenue.collectedCentsMTD, revenue.collectedCentsPrevMonth);
  const gmvPct = momDelta(revenue.gmvCentsMTD, revenue.gmvCentsPrevMonth);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
      <Tile
        label="Billed MTD"
        subtitle="Total claim charges submitted this month."
        value={formatUSDCents(revenue.billedCentsMTD)}
        prevValue={formatUSDCents(revenue.billedCentsPrevMonth)}
        pct={billedPct}
      />
      <Tile
        label="Collected MTD"
        subtitle="Insurance + patient cash actually received."
        value={formatUSDCents(revenue.collectedCentsMTD)}
        prevValue={formatUSDCents(revenue.collectedCentsPrevMonth)}
        pct={collectedPct}
      />
      <Tile
        label="GMV MTD"
        subtitle="All dollars routed through the payment gateway."
        value={formatUSDCents(revenue.gmvCentsMTD)}
        prevValue={formatUSDCents(revenue.gmvCentsPrevMonth)}
        pct={gmvPct}
      />
      <PlaceholderTile />
    </div>
  );
}
