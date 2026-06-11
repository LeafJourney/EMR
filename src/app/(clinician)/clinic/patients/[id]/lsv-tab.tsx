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
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Bubble,
  CollapsibleSection,
  FeatherTrend,
  CindySays,
  ModalShell,
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

/* ── In-page split-pane (EMR-868 / Patel) ─────────────────────────────────
   Reuses the records-tab left-list / right-2x ratio (grid-cols-3 → 1 + 2)
   but renders *inline* on the subtab rather than in a modal: a row click sets
   `selectedId` and the detail opens in the right pane (2x the left list) with
   a close control. Pure presentation — no data fetch, no new-tab href. */

function InlineSplitPane({
  title,
  onClose,
  list,
  detail,
}: {
  title: string;
  onClose: () => void;
  list: React.ReactNode;
  detail: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2.5 border-b border-border bg-surface-muted/40">
        <span className="text-sm font-medium text-text truncate">{title}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close split-pane viewer"
          title="Close"
          className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-surface-muted text-text-subtle text-base leading-none"
        >
          ✕
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3 p-3 h-[60vh]">
        {/* Left: simple title list */}
        <div className="col-span-1 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
          {list}
        </div>
        {/* Right: full detail at 2x width */}
        <div className="col-span-2 overflow-y-auto rounded-lg border border-border bg-surface p-4">
          {detail}
        </div>
      </div>
    </div>
  );
}

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
  // EMR-868: clicking a score row selects it and opens its detail in a right
  // pane (2x the left list) instead of an href. Stable id = slug + timestamp.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  // Flat, chronological-descending list of every score occurrence — the left
  // pane of the split view shows all rows across all titles for quick scanning.
  const allRows = React.useMemo(() => {
    const rows = [...bySlug.values()].flat();
    rows.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
    return rows.map((a) => ({ ...a, rowId: `${a.slug}:${a.submittedAt}` }));
  }, [bySlug]);

  const selected = allRows.find((r) => r.rowId === selectedId) ?? null;

  if (slugs.length === 0) {
    return <EmptyState title="No assessment scores yet" description="Scores appear here once surveys are submitted." />;
  }

  function rowTone(a: LsvAssessment): BubbleTone {
    const def = ASSESSMENTS.find((d) => d.slug === a.slug);
    return a.score != null && def?.cutoffs
      ? interpretScore(def, a.score).band
      : severityFromScore(a.score, { mild: 1, moderate: 5, severe: 10 });
  }

  return (
    <div className="space-y-3">
      {/* EMR-868: in-page split-pane viewer — appears when a row is selected. */}
      {selected && (
        <InlineSplitPane
          title={`${selected.title} — ${new Date(selected.submittedAt).toLocaleDateString()}`}
          onClose={() => setSelectedId(null)}
          list={allRows.map((a) => (
            <button
              key={a.rowId}
              type="button"
              onClick={() => setSelectedId(a.rowId)}
              className={cn(
                "w-full text-left px-3 py-2 text-xs hover:bg-surface-muted/60 flex items-center justify-between gap-2",
                a.rowId === selected.rowId && "bg-accent-soft text-accent font-medium",
              )}
            >
              <span className="truncate">{a.title}</span>
              <span className="tabular-nums text-text-subtle shrink-0">
                {new Date(a.submittedAt).toLocaleDateString()}
              </span>
            </button>
          ))}
          detail={
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg text-text tracking-tight">
                  {selected.title}
                </h3>
                {selected.score != null && (
                  <Bubble tone={rowTone(selected)}>
                    {selected.score}
                    {selected.interpretation ? ` · ${selected.interpretation}` : ""}
                  </Bubble>
                )}
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-text-subtle">Submitted</dt>
                <dd className="text-text tabular-nums">
                  {new Date(selected.submittedAt).toLocaleString()}
                </dd>
                <dt className="text-text-subtle">Score</dt>
                <dd className="text-text font-medium tabular-nums">
                  {selected.score ?? "—"}
                </dd>
                <dt className="text-text-subtle">Interpretation</dt>
                <dd className="text-text">{selected.interpretation ?? "—"}</dd>
              </dl>
            </div>
          }
        />
      )}

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
                {[...list].reverse().map((a) => {
                  const rowId = `${a.slug}:${a.submittedAt}`;
                  return (
                    <li key={rowId}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(rowId)}
                        className={cn(
                          "w-full flex items-center justify-between py-1.5 text-sm text-left hover:bg-surface-muted/50 -mx-1 px-1 rounded",
                          rowId === selectedId && "bg-accent-soft/60",
                        )}
                      >
                        <span className="text-text-muted tabular-nums">
                          {new Date(a.submittedAt).toLocaleDateString()}
                        </span>
                        <span className="text-text font-medium tabular-nums">
                          {a.score ?? "—"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </CollapsibleSection>
          );
        })}
      </div>
    </div>
  );
}

/* ── List / tile view toggle (Patel: "Make an option to make it a list or
      tile view") — pure client state, no data dependency ──────────────── */

type LsvView = "tile" | "list";

function ViewToggle({
  view,
  onChange,
}: {
  view: LsvView;
  onChange: (v: LsvView) => void;
}) {
  return (
    <div
      className="inline-flex rounded-md border border-border bg-surface p-0.5"
      role="group"
      aria-label="View"
    >
      {(
        [
          ["tile", "Tiles", "▦"],
          ["list", "List", "☰"],
        ] as [LsvView, string, string][]
      ).map(([k, label, glyph]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={view === k}
          title={`${label} view`}
          className={cn(
            "px-2 py-0.5 text-xs font-medium rounded transition-colors inline-flex items-center gap-1",
            view === k
              ? "bg-accent text-accent-ink"
              : "text-text-muted hover:bg-surface-muted",
          )}
        >
          <span aria-hidden="true">{glyph}</span>
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── EMR-869: Send composer popup (subject / message / patient) — mirrors
      the Correspondence message box; logs to the chart ledger ─────────── */

function LsvSendModal({
  open,
  onClose,
  docName,
  onSend,
}: {
  open: boolean;
  onClose: () => void;
  docName: string;
  onSend: (payload: { subject: string; message: string; patient: string }) => void;
}) {
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [patient, setPatient] = React.useState("");

  // Reset fields whenever a fresh document is opened.
  React.useEffect(() => {
    if (open) {
      setSubject(docName ? `Re: ${docName}` : "");
      setMessage("");
      setPatient("");
    }
  }, [open, docName]);

  const isDirty = subject.trim() !== "" || message.trim() !== "" || patient.trim() !== "";

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow="Send"
      title={docName || "Send document"}
      placement="center"
      maxWidth="max-w-md"
      isDirty={isDirty}
    >
      <div className="px-6 py-5 space-y-4">
        <div>
          <label className="text-xs font-medium text-text mb-1.5 inline-block">
            Subject
          </label>
          <Input
            value={subject}
            placeholder="Subject"
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text mb-1.5 inline-block">
            Message
          </label>
          <Textarea
            value={message}
            rows={4}
            placeholder="Write your message…"
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs font-medium text-text mb-1.5 inline-block">
            Patient
          </label>
          <Input
            value={patient}
            placeholder="Search a patient by name…"
            onChange={(e) => setPatient(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!subject.trim()}
            onClick={() =>
              onSend({
                subject: subject.trim(),
                message: message.trim(),
                patient: patient.trim(),
              })
            }
          >
            Send
          </Button>
        </div>
      </div>
    </ModalShell>
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

/* EMR-868: opens the in-page split-pane for a result without colliding with
   the CollapsibleSection toggle button (lives in the `right` slot, not title). */
function OpenPaneBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      title="Open in split-pane viewer"
      aria-label="Open in split-pane viewer"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-surface-muted text-text-subtle text-sm"
    >
      ⤢
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
  // List/tile view toggle (Patel) + Send composer target (pure client state).
  const [view, setView] = React.useState<LsvView>("tile");
  const [sendDoc, setSendDoc] = React.useState<ChartDoc | null>(null);
  // EMR-868: in-page split-pane selection. A selected lab document or structured
  // result row opens its detail in the right pane (2x the left list) instead of
  // an href/new tab. Ids are namespaced so docs and results never collide.
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  // EMR-871/638: structured results default to Date order (most-recent first),
  // with a toggle to organize by panel title (CBC, CMP, …). Pure client state.
  const [sortMode, setSortMode] = React.useState<"date" | "panel">("date");
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
  // Flat, most-recent-first ordering for the Date view + the split-pane list.
  const resultsByDate = React.useMemo(
    () =>
      [...labResults].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)),
    [labResults],
  );
  const selectedResult =
    labResults.find((r) => `result:${r.id}` === selectedId) ?? null;
  const selectedDoc =
    labDocs.find((d) => `doc:${d.id}` === selectedId) ?? null;
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

  // Shared per-document action row (reused by tile + list views).
  function docActions(d: ChartDoc) {
    return (
      <div className="flex gap-1 text-text-subtle shrink-0">
        <LsvIconBtn label="Send" onClick={() => setSendDoc(d)}>
          ✉️
        </LsvIconBtn>
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
    );
  }

  return (
    <div className="space-y-4">
      {/* Lab documents (cleaned tiles) */}
      {labDocs.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-text-subtle">
              {labDocs.length} document{labDocs.length === 1 ? "" : "s"}
            </span>
            <ViewToggle view={view} onChange={setView} />
          </div>
          {view === "tile" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {labDocs.map((d) => (
                <Card key={d.id} tone="raised">
                  <CardContent className="pt-4 pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedId(`doc:${d.id}`)}
                        className="text-sm font-medium text-text text-left hover:text-accent truncate"
                      >
                        {d.name}
                      </button>
                      {docActions(d)}
                    </div>
                    <p className="text-sm font-semibold text-text tabular-nums text-right mt-2">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <ul className="rounded-xl border border-border bg-surface divide-y divide-border/60">
              {labDocs.map((d) => (
                <li
                  key={d.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedId(`doc:${d.id}`)}
                    className="text-sm font-medium text-text text-left hover:text-accent truncate"
                  >
                    {d.name}
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold text-text tabular-nums">
                      {new Date(d.createdAt).toLocaleDateString()}
                    </span>
                    {docActions(d)}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* EMR-868: in-page split-pane viewer — appears when a lab document or a
          structured result row is selected; right pane is 2x the left list. */}
      {(selectedDoc || selectedResult) && (
        <InlineSplitPane
          title={
            selectedDoc
              ? selectedDoc.name
              : `${selectedResult!.panelName} — ${new Date(selectedResult!.receivedAt).toLocaleDateString()}`
          }
          onClose={() => setSelectedId(null)}
          list={
            <>
              {labDocs.map((d) => (
                <button
                  key={`doc:${d.id}`}
                  type="button"
                  onClick={() => setSelectedId(`doc:${d.id}`)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs hover:bg-surface-muted/60 flex items-center gap-2",
                    `doc:${d.id}` === selectedId && "bg-accent-soft text-accent font-medium",
                  )}
                >
                  <span aria-hidden="true">📄</span>
                  <span className="truncate">{d.name}</span>
                </button>
              ))}
              {resultsByDate.map((r) => (
                <button
                  key={`result:${r.id}`}
                  type="button"
                  onClick={() => setSelectedId(`result:${r.id}`)}
                  className={cn(
                    "w-full text-left px-3 py-2 text-xs hover:bg-surface-muted/60 flex items-center justify-between gap-2",
                    `result:${r.id}` === selectedId && "bg-accent-soft text-accent font-medium",
                  )}
                >
                  <span className="truncate flex items-center gap-1.5">
                    <span aria-hidden="true">🧪</span>
                    {r.panelName}
                  </span>
                  <span className="tabular-nums text-text-subtle shrink-0">
                    {new Date(r.receivedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </>
          }
          detail={
            selectedDoc ? (
              <div className="h-full flex flex-col -m-4">
                <div className="flex items-center justify-end gap-1.5 px-2 py-1 border-b border-border bg-surface-muted/40">
                  <LsvIconBtn label="Send" onClick={() => setSendDoc(selectedDoc)}>
                    ✉️
                  </LsvIconBtn>
                  <LsvIconBtn
                    label="Open in new tab"
                    onClick={() => window.open(viewUrl(selectedDoc.id), "_blank")}
                  >
                    ↗
                  </LsvIconBtn>
                </div>
                <iframe
                  title={selectedDoc.name}
                  src={viewUrl(selectedDoc.id)}
                  className="flex-1 w-full bg-white"
                />
              </div>
            ) : (
              <LabResultDetail result={selectedResult!} />
            )
          }
        />
      )}

      <LsvSendModal
        open={sendDoc != null}
        onClose={() => setSendDoc(null)}
        docName={sendDoc?.name ?? ""}
        onSend={({ subject, message, patient }) => {
          record({
            kind: "note",
            source: "Labs",
            subject: `Sent “${sendDoc?.name ?? "document"}”${subject ? ` — ${subject}` : ""}${patient ? ` to ${patient}` : ""}`,
            justification: message || undefined,
          });
          setSendDoc(null);
        }}
      />

      {/* EMR-871: real structured results. Default organizes by Date (most
          recent first); a toggle re-organizes by panel title (CBC, CMP, …). */}
      {labResults.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[11px] text-text-subtle">
              {labResults.length} result{labResults.length === 1 ? "" : "s"}
            </span>
            <LabSortToggle mode={sortMode} onChange={setSortMode} />
          </div>
          {sortMode === "date" ? (
            <div className="space-y-2">
              {resultsByDate.map((r) => {
                const markers = Object.keys(r.results);
                return (
                  <CollapsibleSection
                    key={r.id}
                    title={<span className="flex items-center gap-2">🧪 {r.panelName}</span>}
                    meta={new Date(r.receivedAt).toLocaleDateString()}
                    right={
                      <div className="flex items-center gap-2">
                        <Bubble tone={r.abnormalFlag ? "severe" : "normal"}>
                          {r.abnormalFlag ? "Abnormal" : "Normal"}
                        </Bubble>
                        <OpenPaneBtn onClick={() => setSelectedId(`result:${r.id}`)} />
                      </div>
                    }
                    defaultOpen={r.abnormalFlag}
                  >
                    <ul className="divide-y divide-border/50 pt-1">
                      {markers.map((name) => (
                        <LabMarkerRow key={name} marker={r.results[name]} name={name} />
                      ))}
                    </ul>
                  </CollapsibleSection>
                );
              })}
            </div>
          ) : (
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
                      <div className="flex items-center gap-2">
                        <Bubble tone={latest.abnormalFlag ? "severe" : "normal"}>
                          {latest.abnormalFlag ? "Abnormal" : "Normal"}
                        </Bubble>
                        <OpenPaneBtn onClick={() => setSelectedId(`result:${latest.id}`)} />
                      </div>
                    }
                    defaultOpen={latest.abnormalFlag}
                  >
                    <ul className="divide-y divide-border/50 pt-1">
                      {markers.map((name) => {
                        const m = latest.results[name];
                        const series = rows
                          .map((r) => r.results[name]?.value)
                          .filter((v): v is number => typeof v === "number");
                        return (
                          <LabMarkerRow
                            key={name}
                            marker={m}
                            name={name}
                            series={series}
                          />
                        );
                      })}
                    </ul>
                  </CollapsibleSection>
                );
              })}
            </div>
          )}
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

/* ── EMR-871: a single marker row (value bubble, ref range, optional trend) ── */

function LabMarkerRow({
  name,
  marker,
  series,
}: {
  name: string;
  marker: LsvLabMarker;
  series?: number[];
}) {
  const ref =
    marker.refLow != null && marker.refHigh != null
      ? `${marker.refLow}–${marker.refHigh}${marker.unit ? ` ${marker.unit}` : ""}`
      : null;
  return (
    <li className="flex items-center justify-between gap-2 py-1.5 text-sm">
      <span className="text-text">{name}</span>
      <span className="flex items-center gap-2">
        <Bubble tone={marker.abnormal ? "severe" : "normal"}>
          {marker.value}
          {marker.unit ? ` ${marker.unit}` : ""}
        </Bubble>
        {ref && (
          <span className="text-[11px] text-text-subtle tabular-nums">ref {ref}</span>
        )}
        {series && series.length >= 2 && (
          <FeatherTrend
            label={name}
            series={series}
            analysis={cindyTrend({ label: name, values: series, unit: marker.unit })}
          />
        )}
      </span>
    </li>
  );
}

/* ── Full structured-result detail (right split pane) ────────────────────── */

function LabResultDetail({ result }: { result: LsvLabResult }) {
  const markers = Object.keys(result.results);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-lg text-text tracking-tight">
          {result.panelName}
        </h3>
        <Bubble tone={result.abnormalFlag ? "severe" : "normal"}>
          {result.abnormalFlag ? "Abnormal" : "Normal"}
        </Bubble>
      </div>
      <p className="text-xs text-text-subtle tabular-nums">
        Received {new Date(result.receivedAt).toLocaleString()}
      </p>
      <ul className="divide-y divide-border/50 rounded-lg border border-border">
        {markers.map((name) => (
          <li key={name} className="px-3">
            <LabMarkerRow marker={result.results[name]} name={name} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Labs sort toggle (Patel #638): default Date, option to group by title ── */

function LabSortToggle({
  mode,
  onChange,
}: {
  mode: "date" | "panel";
  onChange: (m: "date" | "panel") => void;
}) {
  return (
    <div
      className="inline-flex rounded-md border border-border bg-surface p-0.5"
      role="group"
      aria-label="Organize labs by"
    >
      {(
        [
          ["date", "By date"],
          ["panel", "By panel"],
        ] as ["date" | "panel", string][]
      ).map(([k, label]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          aria-pressed={mode === k}
          title={`Organize labs ${label.toLowerCase()}`}
          className={cn(
            "px-2.5 py-0.5 text-xs font-medium rounded transition-colors",
            mode === k
              ? "bg-accent text-accent-ink"
              : "text-text-muted hover:bg-surface-muted",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/* ── EMR-872: vitals subtab ──────────────────────────────────────────── */

function VitalsSubtab() {
  const cindy = cindyListSummary([], { voice: "says", noun: "vitals readings" });
  // EMR-872: clicking a beige source bubble filters readings to that source.
  // Click the active bubble again to clear. Pure client state — selecting still
  // visibly toggles even when no readings are wired in yet.
  const [source, setSource] = React.useState<string | null>(null);
  return (
    <div className="space-y-3">
      <CindySays analysis={cindy} />
      <div className="flex flex-wrap items-center gap-1.5">
        {VITAL_SOURCES.map((s) => (
          <Bubble
            key={s}
            tone="beige"
            active={source === s}
            title={`Filter by ${s}`}
            onClick={() => setSource((prev) => (prev === s ? null : s))}
          >
            {s}
          </Bubble>
        ))}
        {source && (
          <button
            type="button"
            onClick={() => setSource(null)}
            className="text-[11px] text-accent hover:underline ml-1"
          >
            Clear source filter
          </button>
        )}
      </div>
      {source && (
        <p className="text-[11px] text-text-subtle">
          Showing readings from <span className="font-medium text-text">{source}</span> only.
        </p>
      )}
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
