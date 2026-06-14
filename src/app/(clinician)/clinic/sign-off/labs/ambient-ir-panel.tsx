"use client";

/**
 * EMR-1128 — The Ambient Analytics panel (insulin resistance).
 *
 * Renders the wearable-augmented IR_risk synthesis INLINE inside the lab
 * review overlay — never a pop-up (Fleet Command no-popup rule), soft pastel
 * --status-* tokens, generous padding, a grid-rows height animation so it
 * never causes a layout jump. Context-aware (Zen-Density): it renders only
 * when there is something to say.
 *
 * The score, band, and per-factor contribution breakdown are exactly the
 * `IrRiskResult` from the deterministic engine (src/lib/clinical/ambient-cds)
 * — no fabrication. When no CGM/HRV telemetry is on file the card says so
 * plainly ("labs-only estimate") rather than implying a richer signal.
 */

import { useMemo, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  IR_RISK_WARN_THRESHOLD,
  type IrRiskBand,
  type IrRiskResult,
} from "@/lib/clinical/ambient-cds/types";
import type { AssembledBiomarkers } from "@/lib/clinical/ambient-cds/lab-profile";
import { recommendIrInterventions } from "@/lib/clinical/ambient-cds/interventions";
import {
  stageIrInterventionsAction,
  type StagedHandout,
} from "./ir-risk-actions";

type Tone = "positive" | "link" | "alert";

const BAND_META: Record<
  IrRiskBand,
  { label: string; tone: Tone; badge: "success" | "info" | "warning" | "danger" }
> = {
  optimal: { label: "Optimal sensitivity", tone: "positive", badge: "success" },
  moderate: { label: "Moderate", tone: "link", badge: "info" },
  high: { label: "High", tone: "alert", badge: "warning" },
  severe: { label: "Severe", tone: "alert", badge: "danger" },
};

const FACTOR_LABEL: Record<string, string> = {
  homaIr: "HOMA-IR (fasting glucose × insulin)",
  hba1c: "HbA1c",
  cgmVariability: "CGM glycemic variability",
  hrvReduction: "Nocturnal HRV drop",
};

export interface AmbientIrPanelProps {
  patientId: string;
  result: IrRiskResult | null;
  loading: boolean;
  sources: AssembledBiomarkers["sources"];
}

export function AmbientIrPanel({
  patientId,
  result,
  loading,
  sources,
}: AmbientIrPanelProps) {
  // What state are we in? Drives the context-aware render (and the height
  // animation — `open` is false only when there is genuinely nothing to show).
  const hint =
    !result && !loading && sources.fastingGlucose && !sources.fastingInsulin
      ? "Pair this with a fasting insulin to surface the insulin-resistance index."
      : null;
  const open = loading || !!result || !!hint;

  return (
    <div
      aria-live="polite"
      className="grid transition-[grid-template-rows] duration-300 ease-smooth"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="min-h-0 overflow-hidden">
        {loading && <LoadingCard />}
        {!loading && result && (
          <ResultCard patientId={patientId} result={result} sources={sources} />
        )}
        {!loading && !result && hint && <HintCard text={hint} />}
      </div>
    </div>
  );
}

function Shell({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label="Ambient insulin-resistance analysis"
      className={cn(
        "rounded-2xl border shadow-sm px-5 py-4",
        tone === "alert" &&
          "bg-status-alert-bg/50 border-[color:var(--status-alert-fg)]/25",
        tone === "positive" &&
          "bg-status-positive-bg/45 border-[color:var(--status-positive-fg)]/20",
        tone === "link" &&
          "bg-status-link-bg/40 border-[color:var(--status-link-fg)]/15"
      )}
    >
      {children}
    </section>
  );
}

function Eyebrow({ tone }: { tone: Tone }) {
  return (
    <p
      className={cn(
        "text-[11px] font-semibold uppercase tracking-[0.14em]",
        tone === "alert" && "text-status-alert-fg",
        tone === "positive" && "text-status-positive-fg",
        tone === "link" && "text-status-link-fg"
      )}
    >
      Ambient analysis · Insulin resistance
    </p>
  );
}

function LoadingCard() {
  return (
    <Shell tone="link">
      <Eyebrow tone="link" />
      <p className="mt-2 text-sm text-text-subtle animate-pulse">
        Analyzing metabolic markers…
      </p>
    </Shell>
  );
}

function HintCard({ text }: { text: string }) {
  return (
    <Shell tone="link">
      <Eyebrow tone="link" />
      <p className="mt-2 text-sm text-text-muted leading-relaxed">{text}</p>
    </Shell>
  );
}

function ResultCard({
  patientId,
  result,
  sources,
}: {
  patientId: string;
  result: IrRiskResult;
  sources: AssembledBiomarkers["sources"];
}) {
  const meta = BAND_META[result.band];
  const pct = Math.round(result.score * 100);
  const interventions = useMemo(
    () => recommendIrInterventions(result),
    [result]
  );

  // Selection defaults to everything checked; the provider unchecks what they
  // don't want before staging. One click drafts orders + a handout.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(interventions.map((i) => i.id))
  );
  const [staging, startStaging] = useTransition();
  const [staged, setStaged] = useState<{
    summary: string;
    handout: StagedHandout | null;
  } | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const stage = () => {
    setStageError(null);
    const ids = [...selected];
    startStaging(async () => {
      const res = await stageIrInterventionsAction(patientId, ids);
      if (!res.ok) {
        setStageError(res.error);
        return;
      }
      setStaged({ summary: res.summary, handout: res.handout });
    });
  };

  // Scale factor bars against the largest absolute contribution.
  const maxContribution = useMemo(
    () =>
      Math.max(
        0.0001,
        ...result.factors.map((f) => Math.abs(f.contribution))
      ),
    [result.factors]
  );

  return (
    <Shell tone={meta.tone}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow tone={meta.tone} />
        <Badge tone={meta.badge} className="text-[10px] uppercase">
          {meta.label}
        </Badge>
      </div>

      {/* Score meter with the 0.65 warning marker. */}
      <div className="mt-3">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-text-muted">IR_risk index</span>
          <span className="text-lg font-semibold tabular-nums text-text">
            {result.score.toFixed(2)}
            <span className="text-xs font-normal text-text-subtle"> / 1.00</span>
          </span>
        </div>
        <div className="relative mt-1.5 h-2 rounded-full bg-black/5 overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all",
              meta.tone === "alert" && "bg-status-alert-fg",
              meta.tone === "positive" && "bg-status-positive-fg",
              meta.tone === "link" && "bg-status-link-fg"
            )}
            style={{ width: `${pct}%` }}
          />
          <span
            aria-hidden="true"
            title={`Warning threshold ${IR_RISK_WARN_THRESHOLD}`}
            className="absolute top-[-2px] bottom-[-2px] w-px bg-text-subtle/60"
            style={{ left: `${IR_RISK_WARN_THRESHOLD * 100}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-text-subtle">
          HOMA-IR {result.homaIr.toFixed(2)} · soft tint + this panel appear at
          ≥ {IR_RISK_WARN_THRESHOLD}
        </p>
      </div>

      {/* Per-factor contribution breakdown. */}
      <ul className="mt-3 space-y-2">
        {result.factors.map((f) => (
          <li key={f.factor} className="text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-text-muted">
                {FACTOR_LABEL[f.factor] ?? f.factor}
              </span>
              <span className="text-[11px] tabular-nums text-text-subtle">
                {f.label}
              </span>
            </div>
            <div className="mt-1 h-1.5 rounded-full bg-black/5 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full",
                  f.contribution > 0
                    ? "bg-status-alert-fg/70"
                    : "bg-status-positive-fg/60"
                )}
                style={{
                  width: `${Math.min(
                    100,
                    (Math.abs(f.contribution) / maxContribution) * 100
                  )}%`,
                }}
              />
            </div>
          </li>
        ))}
      </ul>

      {/* Philosophy-aligned suggestions (lifestyle/metabolic before pharma).
          Check the ones to act on; one click drafts orders + a handout — the
          draft orders land in the Orders tab, nothing is signed. */}
      {interventions.length > 0 && !staged && (
        <div className="mt-3 border-t border-border/60 pt-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
            Suggested next steps · select to draft
          </p>
          <ul className="mt-1.5 space-y-1">
            {interventions.map((iv) => (
              <li key={iv.id}>
                <label className="flex items-start gap-2 text-sm cursor-pointer rounded-lg px-1.5 py-1 -mx-1.5 hover:bg-black/[0.02]">
                  <input
                    type="checkbox"
                    checked={selected.has(iv.id)}
                    onChange={() => toggle(iv.id)}
                    disabled={staging}
                    className="mt-1 h-3.5 w-3.5 rounded border-border-strong text-accent focus:ring-accent/30"
                  />
                  <span className="text-text">
                    <span className="font-medium">{iv.title}</span>
                    {iv.labOrder && (
                      <Badge tone="info" className="ml-1.5 text-[9px] uppercase">
                        drafts order
                      </Badge>
                    )}
                    {iv.detail && (
                      <span className="block text-text-muted text-[13px] leading-snug">
                        {iv.detail}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>

          <div className="mt-2.5 flex items-center justify-between gap-3">
            <p className="text-[11px] text-text-subtle">
              Draft orders are staged for your review — not signed or sent.
            </p>
            <button
              type="button"
              onClick={stage}
              disabled={staging || selected.size === 0}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
                "bg-status-positive-bg text-status-positive-fg border border-[color:var(--status-positive-fg)]/25 hover:brightness-[0.97]",
                "disabled:opacity-50 disabled:cursor-not-allowed"
              )}
            >
              {staging ? "Drafting…" : "Draft to Orders"}
            </button>
          </div>
          {stageError && (
            <p className="mt-1.5 text-[11px] text-status-alert-fg">{stageError}</p>
          )}
        </div>
      )}

      {/* Post-stage confirmation — honest about what was (and wasn't) done. */}
      {staged && (
        <div className="mt-3 border-t border-border/60 pt-2.5 space-y-2">
          <p className="text-sm font-medium text-status-positive-fg">
            ✓ {staged.summary}
          </p>
          {staged.handout && (
            <div className="rounded-xl border border-border/70 bg-white/70 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle">
                {staged.handout.title} · draft handout
              </p>
              <p className="mt-1 text-sm text-text whitespace-pre-line leading-relaxed">
                {staged.handout.body}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Provenance + honesty footer. */}
      <div className="mt-3 space-y-1 border-t border-border/60 pt-2.5">
        {!result.wearableAugmented && (
          <p className="text-[11px] text-text-subtle">
            Labs-only estimate — connect a CGM or HRV wearable for a sharper,
            wearable-augmented signal.
          </p>
        )}
        {result.lowConfidence && (
          <p className="text-[11px] text-status-alert-fg">
            Low confidence — the fasting panel is over 180 days old. Re-draw
            before acting on this.
          </p>
        )}
        <p className="text-[11px] text-text-subtle">{provenance(sources)}</p>
      </div>
    </Shell>
  );
}

function provenance(sources: AssembledBiomarkers["sources"]): string {
  const parts: string[] = [];
  if (sources.fastingGlucose) {
    parts.push(
      `glucose ${sources.fastingGlucose.value} (${fmt(sources.fastingGlucose.observedAt)})`
    );
  }
  if (sources.fastingInsulin) {
    parts.push(
      `insulin ${sources.fastingInsulin.value} (${fmt(sources.fastingInsulin.observedAt)})`
    );
  }
  if (sources.hba1c) {
    parts.push(`HbA1c ${sources.hba1c.value}% (${fmt(sources.hba1c.observedAt)})`);
  }
  return parts.length > 0 ? `Sources: ${parts.join(" · ")}` : "";
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
