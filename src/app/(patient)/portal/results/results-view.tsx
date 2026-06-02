"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkline } from "@/components/ui/sparkline";
import { cn } from "@/lib/utils/cn";
import {
  STATUS_COLORS,
  type LabPanel,
  type LabResult,
} from "@/lib/domain/lab-results";
import {
  MODALITY_LABEL,
  SEVERITY_TONE,
  STATUS_LABEL,
  type ImagingStudy,
  type RadiologyReport,
} from "@/lib/domain/medical-imaging";

// EMR-163 — My Results, unified view (client side).
//
// We lift the sort/filter UI into a single client component so labs and
// imaging share controls. The two backing data shapes are different
// enough (lab panel rows vs. radiology study + report) that we keep
// them as distinct cards but unify the chrome: date in the same place,
// "abnormal" badge in the same place, sign-off badge in the same place.

type SortKey = "date-desc" | "date-asc" | "type";
type FilterKey = "all" | "labs" | "imaging" | "abnormal";

interface ResultsViewProps {
  labPanels: LabPanel[];
  studies: ImagingStudy[];
  reports: Record<string, RadiologyReport | null>;
}

interface UnifiedRow {
  kind: "lab" | "imaging";
  id: string;
  date: string;
  panel?: LabPanel;
  study?: ImagingStudy;
  report?: RadiologyReport | null;
  abnormal: boolean;
  signedOff: boolean;
}

function buildRows(props: ResultsViewProps): UnifiedRow[] {
  const rows: UnifiedRow[] = [];
  for (const p of props.labPanels) {
    rows.push({
      kind: "lab",
      id: p.id,
      date: p.resultedAt || p.collectedAt,
      panel: p,
      abnormal: p.results.some((r) => r.status !== "normal"),
      signedOff: p.status === "complete",
    });
  }
  for (const s of props.studies) {
    const r = props.reports[s.id] ?? null;
    rows.push({
      kind: "imaging",
      id: s.id,
      date: s.studyDate,
      study: s,
      report: r,
      abnormal:
        !!r && r.severity !== "normal" && r.severity !== "minor" ? true : false,
      signedOff: !!r && r.releasedToPatient && !!r.signedAt,
    });
  }
  return rows;
}

function buildLabTrend(allPanels: LabPanel[], testName: string): number[] {
  // Pull every result with the same name across panels, oldest → newest.
  const rows: { value: number; t: number }[] = [];
  for (const panel of allPanels) {
    for (const r of panel.results) {
      if (r.name === testName) {
        rows.push({ value: r.value, t: new Date(r.resultedAt).getTime() });
      }
    }
  }
  return rows.sort((a, b) => a.t - b.t).map((r) => r.value);
}

export function ResultsView(props: ResultsViewProps) {
  const [sort, setSort] = React.useState<SortKey>("date-desc");
  const [filter, setFilter] = React.useState<FilterKey>("all");

  const rows = React.useMemo(() => {
    const all = buildRows(props);
    const filtered = all.filter((r) => {
      if (filter === "all") return true;
      if (filter === "labs") return r.kind === "lab";
      if (filter === "imaging") return r.kind === "imaging";
      if (filter === "abnormal") return r.abnormal;
      return true;
    });
    return filtered.sort((a, b) => {
      if (sort === "type") {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        return b.date.localeCompare(a.date);
      }
      const cmp = a.date.localeCompare(b.date);
      return sort === "date-desc" ? -cmp : cmp;
    });
  }, [props, sort, filter]);

  const totalAbnormal = React.useMemo(
    () => buildRows(props).filter((r) => r.abnormal).length,
    [props],
  );

  if (rows.length === 0 && filter === "all") {
    return (
      <EmptyState
        title="No results yet"
        description="Lab and imaging results will appear here as they're released by your care team."
      />
    );
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterChip
          active={filter === "all"}
          onClick={() => setFilter("all")}
          label="All"
        />
        <FilterChip
          active={filter === "labs"}
          onClick={() => setFilter("labs")}
          label="Labs"
        />
        <FilterChip
          active={filter === "imaging"}
          onClick={() => setFilter("imaging")}
          label="Imaging"
        />
        <FilterChip
          active={filter === "abnormal"}
          onClick={() => setFilter("abnormal")}
          label={`Abnormal${totalAbnormal > 0 ? ` (${totalAbnormal})` : ""}`}
        />
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-text-subtle uppercase tracking-wider">
            Sort
          </span>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="h-8 rounded-md border border-border bg-surface px-2 text-sm text-text"
          >
            <option value="date-desc">Newest first</option>
            <option value="date-asc">Oldest first</option>
            <option value="type">By type</option>
          </select>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-text-muted italic px-1 py-6">
          No results match this filter.
        </p>
      ) : (
        rows.map((row) =>
          row.kind === "lab" ? (
            <LabPanelCard
              key={`lab-${row.id}`}
              panel={row.panel!}
              allPanels={props.labPanels}
            />
          ) : (
            <ImagingCard
              key={`img-${row.id}`}
              study={row.study!}
              report={row.report ?? null}
            />
          ),
        )
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
        active
          ? "bg-accent-soft text-accent border-accent/40"
          : "bg-surface text-text-muted border-border hover:border-border-strong",
      )}
    >
      {label}
    </button>
  );
}

function LabPanelCard({
  panel,
  allPanels,
}: {
  panel: LabPanel;
  allPanels: LabPanel[];
}) {
  const [open, setOpen] = React.useState(false);
  const abnormal = panel.results.some((r) => r.status !== "normal");
  const collected = new Date(panel.collectedAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return (
    <Card tone="raised">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-left flex-1 min-w-0"
            aria-expanded={open}
          >
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <Badge tone="info">Labs</Badge>
              {panel.name}
              {abnormal && <Badge tone="warning">Abnormal values</Badge>}
            </CardTitle>
            <CardDescription>Collected {collected}</CardDescription>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <Badge tone={panel.status === "complete" ? "success" : "neutral"}>
              {panel.status === "complete"
                ? "Doctor signed off"
                : panel.status === "partial"
                  ? "Partial"
                  : "Pending"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent>
          <div className="overflow-x-auto -mx-6">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                    Test
                  </th>
                  <th className="px-6 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle text-right">
                    Value
                  </th>
                  <th className="px-6 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                    Range
                  </th>
                  <th className="px-6 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                    Status
                  </th>
                  <th className="px-6 py-2 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                    Trend
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {panel.results.map((r) => (
                  <LabRow key={r.id} result={r} allPanels={allPanels} />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function LabRow({
  result,
  allPanels,
}: {
  result: LabResult;
  allPanels: LabPanel[];
}) {
  const sc = STATUS_COLORS[result.status];
  const isAbnormal = result.status !== "normal";
  const trend = buildLabTrend(allPanels, result.name);

  return (
    <tr className={cn(isAbnormal && sc.bg)}>
      <td className="px-6 py-3 font-medium text-text">{result.name}</td>
      <td
        className={cn(
          "px-6 py-3 text-right tabular-nums font-semibold",
          isAbnormal ? sc.text : "text-text",
        )}
      >
        {result.value} <span className="text-xs text-text-subtle">{result.unit}</span>
      </td>
      <td className="px-6 py-3 text-text-subtle tabular-nums">
        {result.referenceRange
          ? `${result.referenceRange.low} – ${result.referenceRange.high}`
          : "—"}
      </td>
      <td className="px-6 py-3">
        <Badge
          tone={
            result.status === "normal"
              ? "success"
              : result.status === "high" || result.status === "low"
                ? "warning"
                : "danger"
          }
        >
          {sc.label}
        </Badge>
      </td>
      <td className="px-6 py-3">
        {trend.length >= 2 ? (
          <Sparkline data={trend} width={80} height={24} showDots={false} />
        ) : (
          <span className="text-xs text-text-subtle">—</span>
        )}
      </td>
    </tr>
  );
}

function ImagingCard({
  study,
  report,
}: {
  study: ImagingStudy;
  report: RadiologyReport | null;
}) {
  const [open, setOpen] = React.useState(false);
  const studyDate = new Date(study.studyDate).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const severity = report ? SEVERITY_TONE[report.severity] : null;

  return (
    <Card tone="raised">
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="text-left flex-1 min-w-0"
            aria-expanded={open}
          >
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <Badge tone="accent">{study.modality}</Badge>
              {study.description}
              {report && (
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full ring-1",
                    severity?.bg,
                    severity?.text,
                    severity?.ring,
                  )}
                >
                  {severity?.label}
                </span>
              )}
            </CardTitle>
            <CardDescription>
              {MODALITY_LABEL[study.modality]} · {study.bodyPart} · {studyDate}
            </CardDescription>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            {report?.releasedToPatient && report.signedAt ? (
              <Badge tone="success">Doctor signed off</Badge>
            ) : (
              <Badge tone="neutral">{STATUS_LABEL[study.status]}</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-4">
          {study.indication && (
            <div className="rounded-lg border border-border bg-surface-muted/40 p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle mb-1">
                Why this was ordered
              </p>
              <p className="text-sm text-text-muted">{study.indication}</p>
            </div>
          )}
          {report ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-accent/30 bg-accent-soft/30 p-4">
                <p className="text-[10px] uppercase tracking-[0.14em] text-accent mb-1">
                  In plain language
                </p>
                <p className="text-sm text-text leading-relaxed">
                  {report.patientSummary}
                </p>
              </div>
              {report.recommendation && (
                <div className="rounded-lg border border-border p-4">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle mb-1">
                    Recommendation
                  </p>
                  <p className="text-sm text-text-muted">
                    {report.recommendation}
                  </p>
                </div>
              )}
              {report.signedBy && (
                <p className="text-xs text-text-subtle">
                  Signed by {report.signedBy}
                  {report.signedAt
                    ? ` · ${new Date(report.signedAt).toLocaleDateString()}`
                    : ""}
                </p>
              )}
            </div>
          ) : (
            <p className="text-sm text-text-muted italic">
              The radiologist's report hasn't been released yet. Your care team
              will share it when it's ready.
            </p>
          )}
          <div>
            <a
              href={`/portal/imaging`}
              className="inline-block"
            >
              <Button variant="secondary" size="sm">
                Open imaging viewer →
              </Button>
            </a>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
