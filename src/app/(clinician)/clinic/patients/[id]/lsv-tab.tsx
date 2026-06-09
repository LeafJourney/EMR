"use client";

/**
 * Labs, Scores & Vitals tab (formerly "Labs") — EMR-866..872.
 *
 * - 866: renamed to "Labs, Scores, and Vitals" (LSV); the front view shows
 *        the 5 latest Assessments / Labs / Vitals, each expand/collapse; the
 *        de-identified data feeds the LeafNerd analytics engine.
 * - 868: three-layer nav (subtab ribbon → tertiary titles) + split-pane.
 * - 869: cleaned tiles (title-click open, date bottom-right, send/print/save).
 * - 870: Assessment Scores subtab — severity-coloured score bubbles, per-title
 *        collapsibles, Feather trend popup + Cindy says.
 * - 871: Labs subtab — Quest/LabCorp panel titles, normal/abnormal bubbles,
 *        Feather trend.
 * - 872: Vitals subtab — source bubbles (in-office/wearables/RPM) + per-title
 *        date-range filters + Feather.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Bubble,
  CollapsibleSection,
  FeatherTrend,
  CindySays,
  useChartLedger,
} from "./chart-kit";
import type { ChartDoc } from "./records-tab";
import { ASSESSMENTS, interpretScore } from "@/lib/clinical/assessment-catalog";
import { VITALS, VITAL_SOURCES } from "@/lib/clinical/vitals-catalog";
import { cindyTrend, cindyListSummary } from "@/lib/clinical/cindy-says";
import {
  severityFromScore,
  type BubbleTone,
} from "@/lib/clinical/chart-bubbles";

export interface LsvAssessment {
  slug: string;
  title: string;
  score: number | null;
  interpretation: string | null;
  submittedAt: string;
}

/** One marker within a LabResult.results JSON map. */
export interface LsvLabMarker {
  value: number;
  unit?: string;
  refLow?: number;
  refHigh?: number;
  abnormal: boolean;
}

/** A structured lab result row (EMR-871) — mirrors the LabResult model. */
export interface LsvLabResult {
  id: string;
  panelName: string;
  receivedAt: string;
  results: Record<string, LsvLabMarker>;
  abnormalFlag: boolean;
}

type Subtab = "overview" | "assessments" | "labs" | "vitals";

export function LsvTab({
  patientId,
  assessments,
  labDocs,
  labResults,
}: {
  patientId: string;
  assessments: LsvAssessment[];
  labDocs: ChartDoc[];
  labResults: LsvLabResult[];
}) {
  const [subtab, setSubtab] = React.useState<Subtab>("overview");

  // Group assessments by slug for the score subtab + front view.
  const bySlug = React.useMemo(() => {
    const m = new Map<string, LsvAssessment[]>();
    for (const a of assessments) {
      const arr = m.get(a.slug) ?? [];
      arr.push(a);
      m.set(a.slug, arr);
    }
    // chronological ascending for trend series
    for (const arr of m.values())
      arr.sort((x, y) => x.submittedAt.localeCompare(y.submittedAt));
    return m;
  }, [assessments]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="font-display text-xl text-text tracking-tight">
          Labs, Scores, and Vitals
        </h2>
        <span className="text-[11px] text-text-subtle">
          De-identified data feeds the LeafNerd analytics engine 🌿
        </span>
      </div>

      {/* Subtab ribbon */}
      <div className="flex flex-wrap gap-1.5 border-b border-border/60 pb-2">
        {(
          [
            ["overview", "Overview"],
            ["assessments", "Assessment Scores"],
            ["labs", "Labs"],
            ["vitals", "Vitals"],
          ] as [Subtab, string][]
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setSubtab(k)}
            className={cn(
              "px-3 py-1 text-sm font-medium rounded-md transition-colors",
              subtab === k ? "bg-accent text-accent-ink" : "text-text-muted hover:bg-surface-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {subtab === "overview" && (
        <Overview assessments={assessments} labDocs={labDocs} />
      )}
      {subtab === "assessments" && <AssessmentScores bySlug={bySlug} />}
      {subtab === "labs" && (
        <LabsSubtab patientId={patientId} labDocs={labDocs} labResults={labResults} />
      )}
      {subtab === "vitals" && <VitalsSubtab />}
    </div>
  );
}

/* ── EMR-866: front view, latest 5 of each ───────────────────────────── */

function Overview({
  assessments,
  labDocs,
}: {
  assessments: LsvAssessment[];
  labDocs: ChartDoc[];
}) {
  return (
    <div className="space-y-3">
      <CollapsibleSection
        storageKey="lsv:overview:assessments"
        title="Latest 5 Assessment scores"
        meta={`${assessments.length} on file`}
      >
        <ul className="divide-y divide-border/50 pt-1">
          {assessments.slice(0, 5).map((a, i) => {
            const def = ASSESSMENTS.find((d) => d.slug === a.slug);
            const tone: BubbleTone =
              a.score != null && def?.cutoffs
                ? interpretScore(def, a.score).band
                : "normal";
            return (
              <li key={i} className="flex items-center justify-between py-2">
                <span className="text-sm text-text">{a.title}</span>
                <span className="flex items-center gap-2">
                  {a.score != null && <Bubble tone={tone}>{a.score}</Bubble>}
                  <span className="text-xs text-text-subtle tabular-nums">
                    {new Date(a.submittedAt).toLocaleDateString()}
                  </span>
                </span>
              </li>
            );
          })}
          {assessments.length === 0 && (
            <li className="py-3 text-sm text-text-muted">No assessments yet.</li>
          )}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="lsv:overview:labs"
        title="Latest 5 Lab results"
        meta={`${labDocs.length} on file`}
      >
        <ul className="divide-y divide-border/50 pt-1">
          {labDocs.slice(0, 5).map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2">
              <span className="text-sm text-text truncate">{d.name}</span>
              <span className="text-xs text-text-subtle tabular-nums">
                {new Date(d.createdAt).toLocaleDateString()}
              </span>
            </li>
          ))}
          {labDocs.length === 0 && (
            <li className="py-3 text-sm text-text-muted">No labs yet.</li>
          )}
        </ul>
      </CollapsibleSection>

      <CollapsibleSection
        storageKey="lsv:overview:vitals"
        title="Latest 5 Vitals"
        meta="In-office + wearables"
      >
        <p className="py-3 text-sm text-text-muted">
          Connect an in-office device or a wearable (iWatch, Whoop, Garmin, CGM,
          RPM) to populate vitals here.
        </p>
      </CollapsibleSection>
    </div>
  );
}

/* ── EMR-870: assessment scores subtab ───────────────────────────────── */

function AssessmentScores({ bySlug }: { bySlug: Map<string, LsvAssessment[]> }) {
  const slugs = [...bySlug.keys()];
  if (slugs.length === 0) {
    return <EmptyState title="No assessment scores yet" description="Scores appear here once surveys are submitted." />;
  }
  return (
    <div className="space-y-2">
      {slugs.map((slug) => {
        const list = bySlug.get(slug)!;
        const def = ASSESSMENTS.find((d) => d.slug === slug);
        const latest = list[list.length - 1];
        const series = list.map((a) => a.score ?? 0);
        const tone: BubbleTone =
          latest.score != null && def?.cutoffs
            ? interpretScore(def, latest.score).band
            : severityFromScore(latest.score, { mild: 1, moderate: 5, severe: 10 });
        const label = def?.title ?? latest.title;
        return (
          <CollapsibleSection
            key={slug}
            title={
              <span className="flex items-center gap-2">
                {def?.emoji} {label}
              </span>
            }
            right={
              <div className="flex items-center gap-2">
                {latest.score != null && (
                  <Bubble tone={tone}>
                    {latest.score}
                    {latest.interpretation ? ` · ${latest.interpretation}` : ""}
                  </Bubble>
                )}
                <FeatherTrend
                  label={label}
                  series={series}
                  analysis={cindyTrend({
                    label,
                    values: series,
                    interpretation: latest.interpretation,
                  })}
                />
              </div>
            }
          >
            <ul className="divide-y divide-border/50 pt-1">
              {[...list].reverse().map((a, i) => (
                <li key={i} className="flex items-center justify-between py-1.5 text-sm">
                  <span className="text-text-muted tabular-nums">
                    {new Date(a.submittedAt).toLocaleDateString()}
                  </span>
                  <span className="text-text font-medium tabular-nums">
                    {a.score ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </CollapsibleSection>
        );
      })}
    </div>
  );
}

/* ── EMR-871: labs subtab ────────────────────────────────────────────── */

function LsvIconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-surface-muted text-sm"
    >
      {children}
    </button>
  );
}

function LabsSubtab({
  patientId,
  labDocs,
  labResults,
}: {
  patientId: string;
  labDocs: ChartDoc[];
  labResults: LsvLabResult[];
}) {
  // EMR-869: tile actions (print / download / return-to-queue) must be live,
  // not static glyphs. Return-to-queue records to the chart ledger.
  const { record } = useChartLedger(patientId);
  // EMR-871: group structured results by panel (rows already chrono-ascending).
  const byPanel = React.useMemo(() => {
    const m = new Map<string, LsvLabResult[]>();
    for (const r of labResults) {
      const arr = m.get(r.panelName) ?? [];
      arr.push(r);
      m.set(r.panelName, arr);
    }
    return [...m.entries()];
  }, [labResults]);
  const viewUrl = (id: string) => `/clinic/patients/${patientId}/documents/${id}/view`;

  function download(d: ChartDoc) {
    const a = document.createElement("a");
    a.href = viewUrl(d.id);
    a.download = d.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="space-y-4">
      {/* Lab documents (cleaned tiles) */}
      {labDocs.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {labDocs.map((d) => (
            <Card key={d.id} tone="raised">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <a
                    href={viewUrl(d.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-text hover:text-accent truncate"
                  >
                    {d.name}
                  </a>
                  <div className="flex gap-1 text-text-subtle shrink-0">
                    <LsvIconBtn label="Print" onClick={() => window.open(viewUrl(d.id), "_blank")}>
                      🖨️
                    </LsvIconBtn>
                    <LsvIconBtn label="Download" onClick={() => download(d)}>
                      ⬇️
                    </LsvIconBtn>
                    <LsvIconBtn
                      label="Return to queue"
                      onClick={() =>
                        record({
                          kind: "note",
                          source: "Labs",
                          subject: `Returned “${d.name}” to the lab review queue`,
                        })
                      }
                    >
                      ↩︎
                    </LsvIconBtn>
                  </div>
                </div>
                <p className="text-sm font-semibold text-text tabular-nums text-right mt-2">
                  {new Date(d.createdAt).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* EMR-871: real structured results — grouped by panel, abnormal in red,
          per-marker trends from the historical series. */}
      {byPanel.length > 0 ? (
        <div className="space-y-2">
          {byPanel.map(([panelName, rows]) => {
            const latest = rows[rows.length - 1];
            const markers = Object.keys(latest.results);
            return (
              <CollapsibleSection
                key={panelName}
                title={<span className="flex items-center gap-2">🧪 {panelName}</span>}
                meta={new Date(latest.receivedAt).toLocaleDateString()}
                right={
                  <Bubble tone={latest.abnormalFlag ? "severe" : "normal"}>
                    {latest.abnormalFlag ? "Abnormal" : "Normal"}
                  </Bubble>
                }
                defaultOpen={latest.abnormalFlag}
              >
                <ul className="divide-y divide-border/50 pt-1">
                  {markers.map((name) => {
                    const m = latest.results[name];
                    const series = rows
                      .map((r) => r.results[name]?.value)
                      .filter((v): v is number => typeof v === "number");
                    const ref =
                      m.refLow != null && m.refHigh != null
                        ? `${m.refLow}–${m.refHigh}${m.unit ? ` ${m.unit}` : ""}`
                        : null;
                    return (
                      <li
                        key={name}
                        className="flex items-center justify-between gap-2 py-1.5 text-sm"
                      >
                        <span className="text-text">{name}</span>
                        <span className="flex items-center gap-2">
                          <Bubble tone={m.abnormal ? "severe" : "normal"}>
                            {m.value}
                            {m.unit ? ` ${m.unit}` : ""}
                          </Bubble>
                          {ref && (
                            <span className="text-[11px] text-text-subtle tabular-nums">
                              ref {ref}
                            </span>
                          )}
                          {series.length >= 2 && (
                            <FeatherTrend
                              label={name}
                              series={series}
                              analysis={cindyTrend({ label: name, values: series, unit: m.unit })}
                            />
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </CollapsibleSection>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="No structured lab results yet"
          description="Quest/LabCorp results post here with reference ranges, abnormal flags (red), and per-marker trends."
        />
      )}
    </div>
  );
}

/* ── EMR-872: vitals subtab ──────────────────────────────────────────── */

function VitalsSubtab() {
  const cindy = cindyListSummary([], { voice: "says", noun: "vitals readings" });
  return (
    <div className="space-y-3">
      <CindySays analysis={cindy} />
      <div className="flex flex-wrap gap-1.5">
        {VITAL_SOURCES.map((s) => (
          <Bubble key={s} tone="beige">
            {s}
          </Bubble>
        ))}
      </div>
      <div className="space-y-2">
        {VITALS.map((v) => (
          <CollapsibleSection
            key={v.key}
            title={
              <span className="flex items-center gap-2">
                {v.emoji} {v.title}
              </span>
            }
            meta={v.unit}
            right={
              <FeatherTrend
                label={v.title}
                series={[]}
                analysis={cindyTrend({ label: v.title, values: [], unit: v.unit })}
              />
            }
            defaultOpen={false}
          >
            {/* EMR-872: per-title date/time range filter */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                type="date"
                className="text-xs rounded border border-border bg-surface px-2 py-1"
                aria-label={`${v.title} from date`}
              />
              <span className="text-text-subtle text-xs">to</span>
              <input
                type="date"
                className="text-xs rounded border border-border bg-surface px-2 py-1"
                aria-label={`${v.title} to date`}
              />
              <input
                type="text"
                placeholder="e.g. 8–10am"
                className="text-xs rounded border border-border bg-surface px-2 py-1 w-24"
                aria-label={`${v.title} time range`}
              />
            </div>
            <p className="text-[11px] text-text-subtle mt-2">
              Filter {v.title.toLowerCase()} by date/time and source bubble
              (in-office / Garmin / iWatch / Whoop / CGM / RPM).
            </p>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}
