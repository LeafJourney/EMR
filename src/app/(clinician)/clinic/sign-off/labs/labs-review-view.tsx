"use client";

import { useEffect, useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { ModalShell } from "@/components/ui/modal-shell";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { explainLabValue } from "@/lib/domain/lab-explainer";
import { LabTooltip } from "@/components/ui/lab-tooltip";
import { Tooltip } from "@/components/ui/tooltip";
import { LabValue } from "@/components/ui/format";
import { LinkifiedText } from "@/components/ui/linkified-text";
import {
  draftLabOutreachAction,
  updateLabOutreachAction,
  signLabResultAction,
  batchSignLabResultsAction,
} from "./actions";
import { assessIrRiskAction } from "./ir-risk-actions";
import { AmbientIrPanel } from "./ambient-ir-panel";
import { metabolicMarkerNames } from "@/lib/clinical/ambient-cds/lab-profile";
import type { IrRiskResult } from "@/lib/clinical/ambient-cds/types";
import type { AssembledBiomarkers } from "@/lib/clinical/ambient-cds/lab-profile";

// ---------------------------------------------------------------------------
// Types — mirror the server page's LabRow shape
// ---------------------------------------------------------------------------

interface MarkerValue {
  value: number;
  unit: string;
  refLow?: number;
  refHigh?: number;
  abnormal: boolean;
}

export interface LabRow {
  id: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  panelName: string;
  receivedAt: string; // ISO
  abnormalFlag: boolean;
  results: Record<string, unknown>; // Json from Prisma
  prior: {
    id: string;
    receivedAt: string;
    results: Record<string, unknown>;
  } | null;
  history: Array<{ receivedAt: string; results: Record<string, unknown> }>;
  outreach: {
    id: string;
    patientDraft: string;
    maDraft: string;
    physicianNote: string;
    status: string;
  } | null;
}

// Priority markers per MALLIK-006 — highlighted in the overlay.
const PRIORITY = new Set([
  "LDL",
  "HDL",
  "TC",
  "Total Cholesterol",
  "A1C",
  "HbA1c",
  "eGFR",
  "GFR",
  "Cr",
  "Creatinine",
  "ALT",
  "AST",
  "PSA",
  "TSH",
]);

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function patientLabel(first: string, last: string) {
  return `${first} ${last.charAt(0).toUpperCase()}.`;
}

function TrendSparkline({
  name,
  current,
  history,
}: {
  name: string;
  current: number;
  history: Array<{ receivedAt: string; results: Record<string, unknown> }>;
}) {
  const historicalPoints = [...history].reverse().flatMap<{ date: string; value: number }>((h) => {
    const m = (h.results as Record<string, MarkerValue>)[name];
    return typeof m?.value === "number" ? [{ date: h.receivedAt, value: m.value }] : [];
  });

  const all = [...historicalPoints.map((p) => p.value), current];
  if (all.length < 2) return null;

  const W = 52, H = 20, PAD = 2;
  const lo = Math.min(...all), hi = Math.max(...all);
  const span = hi - lo || 1;

  const pts = all.map((v, i) => {
    const x = PAD + (i / (all.length - 1)) * (W - PAD * 2);
    const y = PAD + (1 - (v - lo) / span) * (H - PAD * 2);
    return { x: x.toFixed(1), y: y.toFixed(1) };
  });
  const pStr = pts.map((p) => `${p.x},${p.y}`).join(" ");
  const last = pts[pts.length - 1];

  const tooltipLines = [
    ...historicalPoints.map((p) => {
      const d = new Date(p.date).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      return `${d}: ${p.value}`;
    }),
    `Latest: ${current}`,
  ].join("\n");

  return (
    <svg
      width={W}
      height={H}
      className="inline-block align-middle text-text-subtle"
      aria-label={`Trend: ${tooltipLines.replace(/\n/g, ", ")}`}
    >
      <title>{tooltipLines}</title>
      <polyline
        points={pStr}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={last.x} cy={last.y} r="2" fill="currentColor" />
    </svg>
  );
}

function TrendHistorySection({
  markerNames,
  current,
  history,
}: {
  markerNames: string[];
  current: Record<string, MarkerValue>;
  history: Array<{ receivedAt: string; results: Record<string, unknown> }>;
}) {
  const [open, setOpen] = useState(false);
  const timeline = [...history].reverse(); // oldest first

  if (timeline.length === 0) return null;

  return (
    <section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 text-sm font-semibold text-text"
      >
        Trend history
        <span className="text-text-subtle text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="mt-3 rounded-xl border border-border overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-surface-muted text-text-subtle uppercase tracking-wider">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Marker</th>
                {timeline.map((h) => (
                  <th
                    key={h.receivedAt}
                    className="text-right px-3 py-2 font-medium whitespace-nowrap"
                  >
                    {new Date(h.receivedAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </th>
                ))}
                <th className="text-right px-3 py-2 font-medium text-accent">
                  Latest
                </th>
              </tr>
            </thead>
            <tbody>
              {markerNames.map((name) => {
                const c = current[name];
                return (
                  <tr key={name} className="border-t border-border">
                    <td className="px-3 py-2 font-medium text-text">{name}</td>
                    {timeline.map((h) => {
                      const m = (h.results as Record<string, MarkerValue>)[name];
                      return (
                        <td
                          key={h.receivedAt}
                          className="text-right px-3 py-2 tabular-nums text-text-muted"
                        >
                          {typeof m?.value === "number"
                            ? `${m.value} ${m.unit}`
                            : "—"}
                        </td>
                      );
                    })}
                    <td
                      className={cn(
                        "text-right px-3 py-2 tabular-nums font-medium",
                        c.abnormal ? "text-danger" : "text-accent"
                      )}
                    >
                      {c.value} {c.unit}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function LabsReviewView({ rows }: { rows: LabRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [batch, setBatch] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [trayMsg, setTrayMsg] = useState<string | null>(null);

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  const toggleBatch = (id: string) => {
    setBatch((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const signBatch = () => {
    if (batch.size === 0) return;
    setTrayMsg(null);
    const ids = Array.from(batch);
    startTransition(async () => {
      const res = await batchSignLabResultsAction(ids);
      if (!res.ok) {
        setTrayMsg(res.error);
        return;
      }
      const skipped = res.skipped.length;
      setTrayMsg(
        `Signed ${res.signed} lab${res.signed === 1 ? "" : "s"}` +
          (skipped > 0 ? ` · skipped ${skipped}` : "")
      );
      setBatch(new Set());
      // Server action revalidates /clinic/labs-review; the page re-renders
      // with the newly-signed labs removed from the pending queue.
    });
  };

  return (
    <>
      <Card>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {rows.map((row) => {
              const checked = batch.has(row.id);
              return (
                <li key={row.id} className="flex items-center">
                  {/* Batch checkbox — disabled on abnormal labs per MALLIK-006 rule #4 */}
                  <label
                    className={cn(
                      "pl-6 pr-2 py-4 flex items-center",
                      row.abnormalFlag
                        ? "cursor-not-allowed opacity-50"
                        : "cursor-pointer"
                    )}
                    title={
                      row.abnormalFlag
                        ? "Abnormal labs can't be batch-signed. Open the lab and review individually."
                        : "Add to batch sign"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={row.abnormalFlag}
                      onChange={() => toggleBatch(row.id)}
                      className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/30"
                      aria-label={`Add ${row.panelName} for ${row.patientFirstName} ${row.patientLastName} to batch`}
                    />
                  </label>

                  <button
                    type="button"
                    onClick={() => setSelectedId(row.id)}
                    className="flex-1 text-left flex items-center gap-4 pr-6 py-4 hover:bg-surface-muted transition-colors"
                  >
                    <Avatar
                      firstName={row.patientFirstName}
                      lastName={row.patientLastName}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text">
                          {patientLabel(row.patientFirstName, row.patientLastName)}
                        </p>
                        <span className="text-xs text-text-subtle">·</span>
                        <p className="text-sm text-text-muted">{row.panelName}</p>
                        {row.abnormalFlag && (
                          <Badge tone="danger" className="text-[10px]">
                            abnormal
                          </Badge>
                        )}
                        {row.outreach && (
                          <Badge tone="accent" className="text-[10px]">
                            draft ready
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-text-subtle mt-0.5">
                        Received {fmtDate(row.receivedAt)}
                        {row.prior
                          ? ` · prior on file from ${fmtDate(row.prior.receivedAt)}`
                          : " · no prior on file"}
                      </p>
                    </div>
                    <span className="text-xs text-accent">Review &rarr;</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Batch sign tray — sticky at the bottom while items are selected */}
      {batch.size > 0 && (
        <div className="sticky bottom-4 mt-4 z-20">
          <Card className="shadow-lg border-accent/30">
            <CardContent className="py-3 px-5 flex items-center gap-4">
              <div className="flex-1">
                <p className="text-sm font-medium text-text">
                  {batch.size} lab{batch.size === 1 ? "" : "s"} selected for
                  batch sign
                </p>
                {trayMsg && (
                  <p className="text-xs text-text-subtle mt-0.5">{trayMsg}</p>
                )}
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setBatch(new Set())}
                disabled={pending}
              >
                Clear
              </Button>
              <Button size="sm" onClick={signBatch} disabled={pending}>
                {pending ? "Signing…" : "Sign & Send All"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {selected && (
        <LabOverlay row={selected} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Overlay — current vs. prior comparison + draft preview
// ---------------------------------------------------------------------------

function LabOverlay({ row, onClose }: { row: LabRow; onClose: () => void }) {
  const current = row.results as Record<string, MarkerValue>;
  const prior = (row.prior?.results ?? {}) as Record<string, MarkerValue>;
  const markerNames = Object.keys(current);

  const [drafts, setDrafts] = useState(row.outreach);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // ── Ambient Clinical Intelligence (EMR-1128) ──────────────────────────
  // When the open panel carries any metabolic marker, ask the engine for the
  // patient's insulin-resistance index (assembled across all recent panels).
  // The soft inline tint + the ambient panel surface only when the result
  // warrants it — no pop-ups, context-aware.
  const metabolic = metabolicMarkerNames(current);
  const isMetabolic = Boolean(
    metabolic.fastingGlucose || metabolic.fastingInsulin || metabolic.hba1c
  );
  const [ir, setIr] = useState<IrRiskResult | null>(null);
  const [irSources, setIrSources] = useState<AssembledBiomarkers["sources"]>({});
  const [irLoading, setIrLoading] = useState(false);

  useEffect(() => {
    if (!isMetabolic) return;
    let cancelled = false;
    setIrLoading(true);
    assessIrRiskAction(row.patientId)
      .then((res) => {
        if (cancelled || !res.ok) return;
        setIr(res.result);
        setIrSources(res.sources);
      })
      .finally(() => {
        if (!cancelled) setIrLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [row.patientId, isMetabolic]);

  // Which open-panel rows are the IR drivers worth tinting (glucose/insulin).
  const irDriverNames = new Set(
    [metabolic.fastingGlucose, metabolic.fastingInsulin].filter(Boolean) as string[]
  );
  const irActive = Boolean(ir);
  const irTooltip = ir
    ? `Insulin-resistance signal · IR_risk ${ir.score.toFixed(2)} (${ir.band})` +
      (ir.factors[0] ? ` · top driver: ${ir.factors[0].label}` : "")
    : "";

  const runLooksGood = () => {
    setError(null);
    startTransition(async () => {
      const res = await draftLabOutreachAction(row.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDrafts({
        id: res.outreachId,
        patientDraft: res.patientDraft,
        maDraft: res.maDraft,
        physicianNote: res.physicianNote,
        status: "draft",
      });
    });
  };

  const saveEdit = (
    field: "patientDraft" | "maDraft" | "physicianNote",
    value: string
  ) => {
    if (!drafts) return;
    setDrafts({ ...drafts, [field]: value });
    // Fire-and-forget — UI already reflects the change.
    void updateLabOutreachAction(drafts.id, { [field]: value });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      title={`${row.patientFirstName} ${row.patientLastName}`}
      eyebrow={row.panelName}
      description={`Received ${fmtDate(row.receivedAt)}${row.prior ? ` · compared against ${fmtDate(row.prior.receivedAt)}` : ""}`}
      placement="center"
      maxWidth="max-w-3xl"
      headerActions={
        /* ux/print-stylesheets-clinical — open a server-rendered print view
           in a new tab so the page lands as a clean clinical document with no
           modal chrome. */
        <Tooltip content="Print / Save as PDF">
          <a
            href={`/clinic/sign-off/labs/${row.id}/print`}
            target="_blank"
            rel="noopener"
            className="text-text-subtle hover:text-text p-1.5 rounded-lg hover:bg-surface-muted transition-colors"
            aria-label="Print / Save as PDF"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
          </a>
        </Tooltip>
      }
    >
      <div className="px-6 py-5 space-y-6">
        {/* Ambient insulin-resistance analysis (EMR-1128) — inline, no popup */}
        {isMetabolic && (
          <AmbientIrPanel result={ir} loading={irLoading} sources={irSources} />
        )}

        {/* Values table */}
          <section>
            <h3 className="text-sm font-semibold text-text mb-3">Results</h3>
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-surface-muted text-xs text-text-subtle uppercase tracking-wider">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Marker</th>
                    <th className="text-right px-4 py-2 font-medium">Current</th>
                    <th className="text-right px-4 py-2 font-medium">Prior</th>
                    <th className="text-right px-4 py-2 font-medium">Trend</th>
                    <th className="text-right px-4 py-2 font-medium">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {markerNames.map((name) => {
                    const c = current[name];
                    const p = prior[name];
                    const delta =
                      c && p ? c.value - p.value : null;
                    const isPriority = PRIORITY.has(name);
                    // EMR-1128: soft tint beneath the raw glucose/insulin
                    // values driving the insulin-resistance signal.
                    const isIrDriver = irActive && irDriverNames.has(name);
                    return (
                      <tr
                        key={name}
                        className={cn(
                          "border-t border-border",
                          isPriority && !isIrDriver && "bg-accent/5",
                          isIrDriver &&
                            (ir!.warn
                              ? "bg-status-alert-bg/40"
                              : "bg-status-link-bg/35")
                        )}
                      >
                        <td className="px-4 py-2.5">
                          <LabTooltip name={name} value={c.value}>
                            <span
                              className={cn(
                                "font-medium",
                                isPriority ? "text-text" : "text-text-muted"
                              )}
                            >
                              {name}
                            </span>
                          </LabTooltip>
                          {c.abnormal && (
                            <Badge
                              tone="danger"
                              className="ml-2 text-[10px]"
                            >
                              abnormal
                            </Badge>
                          )}
                        </td>
                        <td
                          className={cn(
                            "text-right px-4 py-2.5 tabular-nums font-medium",
                            c.abnormal ? "text-danger" : "text-text"
                          )}
                        >
                          {isIrDriver ? (
                            <Tooltip content={irTooltip}>
                              <span className="underline decoration-dotted decoration-status-alert-fg/50 underline-offset-4">
                                <LabValue
                                  value={c.value}
                                  unit={c.unit}
                                  refLow={c.refLow}
                                  refHigh={c.refHigh}
                                  hideFlag
                                />
                              </span>
                            </Tooltip>
                          ) : (
                            <LabValue
                              value={c.value}
                              unit={c.unit}
                              refLow={c.refLow}
                              refHigh={c.refHigh}
                              // Row-level abnormal styling already conveys the
                              // out-of-range signal; hide the chip to avoid
                              // duplicate visual flags in the same cell.
                              hideFlag
                            />
                          )}
                        </td>
                        <td className="text-right px-4 py-2.5 tabular-nums text-text-muted">
                          {p
                            ? `${p.value} ${p.unit}`
                            : "—"}
                          {delta !== null && Math.abs(delta) > 0.001 && (
                            <span
                              className={cn(
                                "ml-1.5 text-xs",
                                (delta > 0 && (c.refHigh === undefined || p!.value <= c.refHigh) && c.abnormal) ||
                                  (delta < 0 && c.refLow !== undefined && c.value < c.refLow)
                                  ? "text-danger"
                                  : delta < 0 && c.refHigh !== undefined
                                    ? "text-success"
                                    : delta > 0 && c.refLow !== undefined
                                      ? "text-success"
                                      : "text-text-subtle"
                              )}
                            >
                              ({delta > 0 ? "+" : ""}
                              {delta.toFixed(Math.abs(delta) < 1 ? 1 : 0)})
                            </span>
                          )}
                        </td>
                        <td className="text-right px-4 py-2.5">
                          <TrendSparkline
                            name={name}
                            current={c.value}
                            history={row.history}
                          />
                        </td>
                        <td className="text-right px-4 py-2.5 text-xs text-text-subtle tabular-nums">
                          {c.refLow !== undefined && c.refHigh !== undefined
                            ? `${c.refLow}–${c.refHigh}`
                            : c.refLow !== undefined
                              ? `≥ ${c.refLow}`
                              : c.refHigh !== undefined
                                ? `≤ ${c.refHigh}`
                                : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-text-subtle mt-2">
              Highlighted rows are priority markers. Abnormal values are flagged
              in red and cannot be added to a batch sign.
            </p>
          </section>

          {/* Trend history — collapsible table of historical priority-marker values */}
          {markerNames.some((name) => PRIORITY.has(name)) && (
            <TrendHistorySection
              markerNames={markerNames.filter((name) => PRIORITY.has(name))}
              current={current}
              history={row.history}
            />
          )}

          {/* Plain-language blurbs for priority markers */}
          <section>
            <h3 className="text-sm font-semibold text-text mb-3">
              What these mean
            </h3>
            <div className="space-y-2">
              {markerNames
                .filter((name) => PRIORITY.has(name))
                .map((name) => {
                  const m = current[name];
                  const expl = explainLabValue(name, m.value);
                  if (!expl) return null;
                  return (
                    <div
                      key={name}
                      className="rounded-lg bg-surface-muted/60 px-4 py-3 text-sm"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          aria-hidden="true"
                          className="text-base"
                        >
                          {expl.explanation.emoji}
                        </span>
                        <span className="font-medium text-text">
                          {expl.explanation.name}
                        </span>
                        <Badge
                          tone={
                            expl.status === "high" || expl.status === "low"
                              ? "warning"
                              : "success"
                          }
                          className="text-[10px]"
                        >
                          {expl.status}
                        </Badge>
                      </div>
                      <p className="text-text-muted leading-relaxed">
                        {expl.message}
                      </p>
                    </div>
                  );
                })}
            </div>
          </section>

          {/* Outreach drafts */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-text">
                Patient outreach drafts
              </h3>
              <Button
                size="sm"
                onClick={runLooksGood}
                disabled={pending}
              >
                {pending
                  ? "Drafting…"
                  : drafts
                    ? "Re-draft"
                    : "Looks good — draft outreach"}
              </Button>
            </div>

            {error && (
              <p className="text-xs text-danger mb-3">{error}</p>
            )}

            {!drafts && !pending && (
              <p className="text-sm text-text-muted">
                Click <em>Looks good</em> to generate patient, MA, and chart
                drafts. You&apos;ll be able to review and edit them before
                anything is sent.
              </p>
            )}

            {drafts && (
              <div className="space-y-4">
                <DraftBlock
                  label="Patient message"
                  description="Friendly, 6th-grade tone. Sent to the patient's portal or as SMS on sign."
                  value={drafts.patientDraft}
                  onBlur={(v) => saveEdit("patientDraft", v)}
                  preview
                />
                <DraftBlock
                  label="MA task"
                  description="One-sentence instruction for your MA."
                  value={drafts.maDraft}
                  onBlur={(v) => saveEdit("maDraft", v)}
                />
                <DraftBlock
                  label="Chart note"
                  description="One-liner for the patient's chart."
                  value={drafts.physicianNote}
                  onBlur={(v) => saveEdit("physicianNote", v)}
                />
              </div>
            )}
          </section>

          {/* Sign lab */}
          <section className="pt-4 border-t border-border">
            <SignLabFooter
              labResultId={row.id}
              hasDrafts={!!drafts}
              abnormal={row.abnormalFlag}
              onSigned={onClose}
            />
          </section>
        </div>
    </ModalShell>
  );
}

function SignLabFooter({
  labResultId,
  hasDrafts,
  abnormal,
  onSigned,
}: {
  labResultId: string;
  hasDrafts: boolean;
  abnormal: boolean;
  onSigned: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const sign = () => {
    setError(null);
    startTransition(async () => {
      const res = await signLabResultAction(labResultId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.signed === 0 && res.skipped.length > 0) {
        setError(res.skipped[0].reason);
        return;
      }
      // Queue revalidates via the server action; close the overlay so
      // the clinician lands back on the pending list minus this row.
      onSigned();
    });
  };

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        {!hasDrafts && (
          <p className="text-xs text-text-subtle">
            Generate outreach drafts above before signing, or sign now if no
            patient message is needed.
          </p>
        )}
        {abnormal && (
          <p className="text-xs text-warning">
            Abnormal values flagged. You can sign here individually, but this
            lab cannot be added to a batch.
          </p>
        )}
        {error && <p className="text-xs text-danger mt-1">{error}</p>}
      </div>
      <Button onClick={sign} disabled={pending}>
        {pending ? "Signing…" : "Sign lab"}
      </Button>
    </div>
  );
}

function DraftBlock({
  label,
  description,
  value,
  onBlur,
  preview,
}: {
  label: string;
  description: string;
  value: string;
  onBlur: (v: string) => void;
  preview?: boolean;
}) {
  const [local, setLocal] = useState(value);
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    void navigator.clipboard.writeText(local).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div>
      <label className="block text-xs font-medium text-text mb-0.5">
        {label}
      </label>
      <p className="text-[11px] text-text-subtle mb-1.5">{description}</p>
      {preview && local && (
        <div className="mb-3 flex items-start gap-2">
          <div className="rounded-2xl rounded-tl-sm bg-surface-muted px-4 py-3 max-w-[85%] flex-1">
            <p className="text-[10px] text-accent font-medium mb-1">
              💬 From your care team
            </p>
            <LinkifiedText
              as="p"
              className="text-sm text-text leading-relaxed whitespace-pre-wrap"
              text={local}
            />
          </div>
          <button
            type="button"
            onClick={copyToClipboard}
            className="shrink-0 text-xs text-text-subtle hover:text-text mt-1 px-2 py-1 rounded-md hover:bg-surface-muted transition-colors"
            title="Copy patient message to clipboard"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
      )}
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (local !== value) onBlur(local);
        }}
        rows={Math.max(3, Math.min(8, local.split("\n").length + 1))}
        className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text resize-y focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
    </div>
  );
}
