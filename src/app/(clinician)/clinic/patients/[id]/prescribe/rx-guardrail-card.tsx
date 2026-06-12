"use client";

/**
 * EMR-1131 / EMR-1135 — The Ambient Optimization Canvas.
 *
 * Inline optimization card rendered NEXT TO the medication fields on the
 * prescribe form (never a modal/pop-up, per the red-text spec Phase 6 and
 * the Fleet Command no-popup rule). Shows ranked guardrail findings (hard
 * stops first) with mechanism, patient-specific rationale, recommendation,
 * citations (CPIC level, lab dates) and queued follow-up labs.
 *
 * One-click accept: findings carrying an actionable recommendation expose an
 * "Apply" button; the form applies the swap/dose adjustment into the DRAFT
 * fields (the provider still reviews and signs), logs the acceptance, and
 * re-evaluates — the card then clears on its own.
 *
 * Zen-Density: soft pastel fills (--status-* tokens), 16px padding grid, and
 * a grid-rows height animation so the card never causes layout jumps.
 */

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  LOINC,
  type GuardrailFinding,
  type RxSafetyEvaluation,
} from "@/lib/clinical/rx-safety/types";

/* ── One-click adjustment resolution ─────────────────────────────────── */

export type GuardrailAdjustment =
  | { type: "swap"; drugName: string; label: string }
  | { type: "dose"; dose: string; unit: string; label: string };

export interface AdjustmentContext {
  doseValue: string;
  unitValue: string;
  frequencyPerDay: number;
}

/**
 * Safer-alternative swaps for rules whose recommendation names a specific
 * replacement molecule (spec Phase 2 table). Strengths follow the usual
 * starting strengths; the provider reviews dose/frequency before signing.
 */
const RULE_SWAPS: Record<string, string> = {
  "pgx.clopidogrel.cyp2c19": "Ticagrelor 90mg",
  "pgx.allopurinol.hlab5801": "Febuxostat 40mg",
};

function round2(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Map a finding to a concrete draft mutation, when one can be derived
 * deterministically:
 *   - rule-keyed molecule swaps (hard_substitution / HLA hard stop);
 *   - details.suggestedDoseReductionPct (e.g. CBD × anticoagulant −25%);
 *   - hepatic daily-dose caps ("≤2000 mg" parsed from the recommendation,
 *     divided across the drafted frequency) when dosing in mg.
 * Findings without a derivable mutation render without an Apply button —
 * the provider acts on the prose recommendation manually.
 */
export function actionableAdjustment(
  finding: GuardrailFinding,
  ctx: AdjustmentContext
): GuardrailAdjustment | null {
  const swap = RULE_SWAPS[finding.ruleId];
  if (swap) {
    return { type: "swap", drugName: swap, label: `Switch to ${swap}` };
  }

  const dose = parseFloat(ctx.doseValue);
  const doseIsUsable = Number.isFinite(dose) && dose > 0;

  const pct = finding.details?.suggestedDoseReductionPct;
  if (typeof pct === "number" && pct > 0 && pct < 100 && doseIsUsable) {
    const next = round2(dose * (1 - pct / 100));
    return {
      type: "dose",
      dose: next,
      unit: ctx.unitValue,
      label: `Reduce dose ${pct}% → ${next} ${ctx.unitValue}`,
    };
  }

  // Hepatic cap: "Cap total daily dose at ≤2000 mg, …"
  if (finding.ruleId === "organ.hepatic.dose_cap") {
    const capMatch = finding.recommendation.match(/≤\s*(\d+(?:\.\d+)?)\s*mg/);
    const exceeds = finding.details?.exceedsCap === true;
    if (
      capMatch &&
      exceeds &&
      doseIsUsable &&
      ctx.unitValue.trim().toLowerCase() === "mg" &&
      ctx.frequencyPerDay > 0
    ) {
      const capMg = parseFloat(capMatch[1]);
      const next = round2(capMg / ctx.frequencyPerDay);
      return {
        type: "dose",
        dose: next,
        unit: "mg",
        label: `Cap at ${capMg} mg/day → ${next} mg per dose`,
      };
    }
  }

  return null;
}

/* ── Presentation maps ───────────────────────────────────────────────── */

const KIND_LABEL: Record<GuardrailFinding["kind"], string> = {
  hard_stop: "Hard stop",
  hard_substitution: "Substitution required",
  dosing_override: "Dose adjustment",
  optimization: "Optimization",
  info: "Info",
};

const KIND_TONE: Record<
  GuardrailFinding["kind"],
  "danger" | "warning" | "info" | "neutral"
> = {
  hard_stop: "danger",
  hard_substitution: "danger",
  dosing_override: "warning",
  optimization: "info",
  info: "neutral",
};

const LAYER_LABEL: Record<GuardrailFinding["layer"], string> = {
  pgx: "Genomic",
  organ: "Organ clearance",
  botanical: "Botanical",
};

const FOLLOW_UP_LAB_LABEL: Record<string, string> = {
  [LOINC.INR]: "INR",
  [LOINC.SERUM_CREATININE]: "Serum creatinine",
  [LOINC.TOTAL_BILIRUBIN]: "Total bilirubin",
  [LOINC.ALBUMIN]: "Albumin",
};

const BLOCKING_KINDS = new Set<GuardrailFinding["kind"]>([
  "hard_stop",
  "hard_substitution",
]);

/* ── Card ────────────────────────────────────────────────────────────── */

export interface RxGuardrailCardProps {
  evaluation: RxSafetyEvaluation | null;
  /** True while a (debounced) evaluation is in flight. */
  evaluating: boolean;
  adjustmentContext: AdjustmentContext;
  onAccept: (finding: GuardrailFinding, adjustment: GuardrailAdjustment) => void;
  /** Disables Apply buttons while an acceptance is being logged. */
  accepting?: boolean;
}

export function RxGuardrailCard({
  evaluation,
  evaluating,
  adjustmentContext,
  onAccept,
  accepting = false,
}: RxGuardrailCardProps) {
  const findings = useMemo(() => evaluation?.findings ?? [], [evaluation]);
  const open = findings.length > 0;
  const blocking = evaluation?.hasBlockingFinding ?? false;

  // Memoize adjustment resolution so render stays cheap while typing.
  const adjustments = useMemo(
    () => findings.map((f) => actionableAdjustment(f, adjustmentContext)),
    [findings, adjustmentContext]
  );

  return (
    <div
      aria-live="polite"
      className="grid transition-[grid-template-rows] duration-300 ease-smooth"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div className="min-h-0 overflow-hidden">
        <section
          aria-label="Prescription safety guardrails"
          className={cn(
            "rounded-2xl border shadow-sm",
            blocking
              ? "bg-status-alert-bg/50 border-[color:var(--status-alert-fg)]/25"
              : "bg-status-link-bg/40 border-[color:var(--status-link-fg)]/15"
          )}
        >
          <header className="flex items-center justify-between gap-3 px-5 pt-4 pb-1">
            <p
              className={cn(
                "text-[11px] font-semibold uppercase tracking-[0.14em]",
                blocking
                  ? "text-status-alert-fg"
                  : "text-status-link-fg"
              )}
            >
              Safety &amp; optimization
            </p>
            {evaluating ? (
              <span className="text-[11px] text-text-subtle animate-pulse">
                re-checking…
              </span>
            ) : (
              evaluation && (
                <span className="text-[11px] text-text-subtle">
                  checked{" "}
                  {new Date(evaluation.evaluatedAt).toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </span>
              )
            )}
          </header>

          <ul className="px-4 pb-4 pt-1 space-y-3">
            {findings.map((finding, i) => (
              <FindingRow
                key={`${finding.ruleId}-${i}`}
                finding={finding}
                adjustment={adjustments[i]}
                onAccept={onAccept}
                accepting={accepting}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function FindingRow({
  finding,
  adjustment,
  onAccept,
  accepting,
}: {
  finding: GuardrailFinding;
  adjustment: GuardrailAdjustment | null;
  onAccept: RxGuardrailCardProps["onAccept"];
  accepting: boolean;
}) {
  const isBlocking = BLOCKING_KINDS.has(finding.kind);
  return (
    <li
      className={cn(
        "rounded-xl border bg-white/80 p-4 space-y-2",
        isBlocking
          ? "border-[color:var(--status-alert-fg)]/30"
          : "border-border/70"
      )}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <Badge tone={KIND_TONE[finding.kind]} className="uppercase text-[10px]">
          {KIND_LABEL[finding.kind]}
        </Badge>
        <Badge tone="neutral" className="text-[10px]">
          {LAYER_LABEL[finding.layer]}
        </Badge>
        {finding.lowConfidence && (
          <span className="text-[11px] text-text-subtle italic">
            stale labs — drawn &gt;180 days ago, verify before relying on this
          </span>
        )}
      </div>

      <p className="text-sm text-text leading-relaxed">{finding.rationale}</p>
      <p className="text-xs text-text-muted leading-snug">{finding.mechanism}</p>
      <p className="text-sm font-medium text-text leading-snug">
        {finding.recommendation}
      </p>

      {finding.requiredFollowUp && finding.requiredFollowUp.length > 0 && (
        <p className="text-xs text-text-muted">
          Follow-up on accept:{" "}
          {finding.requiredFollowUp
            .map(
              (f) =>
                `${FOLLOW_UP_LAB_LABEL[f.labLoinc] ?? `LOINC ${f.labLoinc}`} (${f.timing})`
            )
            .join(" · ")}
        </p>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <p className="text-[11px] text-text-subtle">
          {finding.citations.join(" · ")}
        </p>
        {adjustment && (
          <button
            type="button"
            disabled={accepting}
            onClick={() => onAccept(finding, adjustment)}
            className={cn(
              "shrink-0 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              isBlocking
                ? "bg-status-alert-fg text-white hover:brightness-110"
                : "bg-status-positive-bg text-status-positive-fg border border-[color:var(--status-positive-fg)]/25 hover:brightness-[0.97]"
            )}
          >
            ✓ {adjustment.label}
          </button>
        )}
      </div>
    </li>
  );
}
