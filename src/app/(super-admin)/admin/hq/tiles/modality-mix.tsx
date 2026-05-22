import Link from "next/link";
import type { ModalityMixRow, SpecialtyDriftRow, SpecialtyMixRow } from "../types";
import { colorForKey, formatCount } from "./format";

const LABEL_OVERRIDES: Record<string, string> = {
  "cannabis-medicine": "Cannabis medicine",
  cannabis: "Cannabis medicine",
  "pain-management": "Pain management",
  pain: "Pain management",
  "internal-medicine": "Internal medicine",
  internal: "Internal medicine",
};

function prettyLabel(key: string): string {
  if (LABEL_OVERRIDES[key]) return LABEL_OVERRIDES[key];
  return key
    .split(/[-_]/g)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function ModalityStack({ rows }: { rows: ModalityMixRow[] }) {
  const total = rows.reduce((a, r) => a + r.practiceCount, 0);
  if (total === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-muted/40">
        {rows.map((r, i) => {
          const pct = (r.practiceCount / total) * 100;
          return (
            <Link
              key={r.modality}
              href={`/practices?modality=${encodeURIComponent(r.modality)}`}
              aria-label={`${prettyLabel(r.modality)} — ${r.practiceCount} practices`}
              style={{ width: `${pct}%`, backgroundColor: colorForKey(r.modality, i) }}
              className="block h-full first:rounded-l-full last:rounded-r-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            />
          );
        })}
      </div>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rows.map((r, i) => {
          const pct = ((r.practiceCount / total) * 100).toFixed(0);
          return (
            <li key={r.modality}>
              <Link
                href={`/practices?modality=${encodeURIComponent(r.modality)}`}
                className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-surface-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colorForKey(r.modality, i) }}
                  aria-hidden="true"
                />
                <span className="text-text flex-1 truncate">{prettyLabel(r.modality)}</span>
                <span className="tabular-nums text-text-muted text-xs">{formatCount(r.practiceCount)} · {pct}%</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SpecialtyDriftList({
  mix,
  drift,
}: {
  mix: SpecialtyMixRow[];
  drift: SpecialtyDriftRow[];
}) {
  if (mix.length === 0) return null;
  const driftBySpecialty = new Map<string, SpecialtyDriftRow[]>();
  for (const d of drift) {
    const arr = driftBySpecialty.get(d.specialty) ?? [];
    arr.push(d);
    driftBySpecialty.set(d.specialty, arr);
  }
  // Group total by specialty for the "latest" row count.
  const totalsBySpecialty = new Map<string, number>();
  const latestVersionBySpecialty = new Map<string, string>();
  for (const m of mix) {
    totalsBySpecialty.set(m.specialty, (totalsBySpecialty.get(m.specialty) ?? 0) + m.practiceCount);
    const cur = latestVersionBySpecialty.get(m.specialty);
    if (!cur || m.manifestVersion > cur) latestVersionBySpecialty.set(m.specialty, m.manifestVersion);
  }

  return (
    <ul className="space-y-2.5">
      {Array.from(totalsBySpecialty.entries()).map(([specialty, total], i) => {
        const driftRows = driftBySpecialty.get(specialty) ?? [];
        const onLatest = total - driftRows.reduce((a, d) => a + d.practiceCount, 0);
        const latest = latestVersionBySpecialty.get(specialty) ?? "";
        return (
          <li key={specialty} className="rounded-md px-1 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text truncate">{prettyLabel(specialty)}</span>
              <span className="text-xs text-text-subtle tabular-nums">v{latest}</span>
            </div>
            <div className="mt-1.5 flex h-1.5 w-full overflow-hidden rounded-full bg-surface-muted/40">
              <Link
                href={`/practices?specialty=${encodeURIComponent(specialty)}&version=${encodeURIComponent(latest)}`}
                aria-label={`${onLatest} practices on latest manifest v${latest}`}
                style={{ width: `${(onLatest / total) * 100}%`, backgroundColor: colorForKey(specialty, i) }}
                className="block h-full"
              />
              {driftRows.map((d) => (
                <Link
                  key={d.currentVersion}
                  href={`/practices?specialty=${encodeURIComponent(specialty)}&version=${encodeURIComponent(d.currentVersion)}`}
                  title={`v${d.currentVersion} (${d.practiceCount} practices behind v${d.latestVersion})`}
                  style={{ width: `${(d.practiceCount / total) * 100}%`, backgroundColor: colorForKey(specialty, i) }}
                  className="block h-full opacity-40"
                />
              ))}
            </div>
            <div className="mt-1 text-[11px] text-text-subtle">
              {formatCount(onLatest)} on latest{driftRows.length ? ` · ${formatCount(total - onLatest)} behind` : ""}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function ModalityMix({
  modalityMix,
  specialtyMix,
  specialtyDrift,
}: {
  modalityMix: ModalityMixRow[];
  specialtyMix: SpecialtyMixRow[];
  specialtyDrift: SpecialtyDriftRow[];
}) {
  if (modalityMix.length === 0 && specialtyMix.length === 0) {
    return <p className="text-sm text-text-muted py-6">No live practices.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
      <div>
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-text-subtle mb-3">Modality mix</h3>
        <ModalityStack rows={modalityMix} />
      </div>
      <div>
        <h3 className="text-[11px] uppercase tracking-[0.16em] text-text-subtle mb-3">Specialty version drift</h3>
        <SpecialtyDriftList mix={specialtyMix} drift={specialtyDrift} />
      </div>
    </div>
  );
}
