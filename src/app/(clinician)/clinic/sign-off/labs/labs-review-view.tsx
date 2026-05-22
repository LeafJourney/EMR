"use client";

import { useState, useTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Printer } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { explainLabValue } from "@/lib/domain/lab-explainer";
import { LabTooltip } from "@/components/ui/lab-tooltip";
import {
  draftLabOutreachAction,
  updateLabOutreachAction,
  signLabResultAction,
  batchSignLabResultsAction,
} from "./actions";

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
  const priorVals = [...history].reverse().reduce<number[]>((acc, h) => {
    const m = (h.results as Record<string, MarkerValue>)[name];
    if (typeof m?.value === "number") acc.push(m.value);
    return acc;
  }, []);

  const all = [...priorVals, current];
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

  return (
    <svg
      width={W}
      height={H}
      className="inline-block align-middle text-text-subtle"
      aria-hidden="true"
    >
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Lab review for ${row.patientFirstName} ${row.patientLastName}`}
    >
      <div
        className="bg-bg rounded-2xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-4 sticky top-0 bg-bg z-10">
          <div>
            <p className="text-xs uppercase tracking-wider text-text-subtle font-medium">
              {row.panelName}
            </p>
            <h2 className="font-display text-2xl text-text tracking-tight mt-1">
              {row.patientFirstName} {row.patientLastName}
            </h2>
            <p className="text-sm text-text-muted mt-1">
              Received {fmtDate(row.receivedAt)}
              {row.prior && ` · compared against ${fmtDate(row.prior.receivedAt)}`}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="text-text-subtle hover:text-text p-1.5 rounded-lg hover:bg-surface-muted transition-colors"
              aria-label="Print / Save as PDF"
              title="Print / Save as PDF"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              onClick={onClose}
              className="text-text-subtle hover:text-text text-xl leading-none px-2"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6">
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
                    return (
                      <tr
                        key={name}
                        className={cn(
                          "border-t border-border",
                          isPriority && "bg-accent/5"
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
                          {c.value} {c.unit}
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
      </div>
    </div>
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
  return (
    <div>
      <label className="block text-xs font-medium text-text mb-0.5">
        {label}
      </label>
      <p className="text-[11px] text-text-subtle mb-1.5">{description}</p>
      {preview && local && (
        <div className="mb-3 flex">
          <div className="rounded-2xl rounded-tl-sm bg-surface-muted px-4 py-3 max-w-[85%]">
            <p className="text-[10px] text-accent font-medium mb-1">
              💬 From your care team
            </p>
            <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
              {local}
            </p>
          </div>
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
