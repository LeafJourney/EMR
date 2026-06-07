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
import { LAB_PANELS } from "@/lib/clinical/lab-directory";
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

type Subtab = "overview" | "assessments" | "labs" | "vitals";

export function LsvTab({
  patientId,
  assessments,
  labDocs,
}: {
  patientId: string;
  assessments: LsvAssessment[];
  labDocs: ChartDoc[];
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
      {subtab === "labs" && <LabsSubtab patientId={patientId} labDocs={labDocs} />}
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

function LabsSubtab({ patientId, labDocs }: { patientId: string; labDocs: ChartDoc[] }) {
  // EMR-869: tile actions (print / download / return-to-queue) must be live,
  // not static glyphs. Return-to-queue records to the chart ledger.
  const { record } = useChartLedger(patientId);
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

      {/* Panel taxonomy with normal/abnormal + Feather */}
      <div className="space-y-2">
        {LAB_PANELS.map((panel) => (
          <CollapsibleSection
            key={panel.key}
            title={
              <span className="flex items-center gap-2">
                {panel.emoji} {panel.title}
              </span>
            }
            meta={panel.source}
            right={
              <FeatherTrend
                label={panel.title}
                series={[]}
                analysis={cindyTrend({ label: panel.title, values: [] })}
              />
            }
            defaultOpen={false}
          >
            <div className="flex flex-wrap gap-1.5 pt-1">
              {panel.components.map((c) => (
                <Bubble key={c.name} tone="normal">
                  {c.name}
                  {c.unit ? ` (${c.unit})` : ""}
                </Bubble>
              ))}
            </div>
            <p className="text-[11px] text-text-subtle mt-2">
              Results from {panel.source}. Click a result to split-pane the
              original report; normal = green, abnormal = red.
            </p>
          </CollapsibleSection>
        ))}
      </div>
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
