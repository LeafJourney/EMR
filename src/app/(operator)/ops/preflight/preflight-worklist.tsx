"use client";

/**
 * EMR-1139 — interactive worklist for the Pre-Flight Claims Dashboard.
 *
 * Fleet Command Directive compliance:
 *   - ≤2 clicks: click a row to expand (the riskiest row starts expanded),
 *     click the fix — done. No wizards, no confirmation pop-ups.
 *   - No pop-ups: the narrative evidence panel is an inline expanding
 *     section, never a modal.
 *   - Zen-Density: 16–24px padding grid, soft pastel --status-* tokens for
 *     dispositions, information appears only when a row is expanded.
 */

import * as React from "react";
import { useState, useTransition } from "react";
import { ChevronDown, FileText, Sparkles, Wrench } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatCard, type StatCardTone } from "@/components/ui/stat-card";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils/cn";
import type {
  DeficiencyCategory,
  Disposition,
  RootCauseFinding,
} from "@/lib/billing/preflight";
import type { EvidenceSentence } from "./helpers";
import {
  applyPreflightRemediation,
  type RemediationInput,
} from "./actions";

// ---------------------------------------------------------------------------
// Serialized prop shapes (computed server-side in page.tsx)
// ---------------------------------------------------------------------------

export interface PreflightRow {
  id: string;
  claimNumber: string | null;
  status: string;
  patientId: string;
  patientName: string;
  payerName: string | null;
  serviceDateLabel: string;
  billedLabel: string;
  billedAmountCents: number;
  cptDisplay: string[];
  icdDisplay: string[];
  score: number;
  disposition: Disposition;
  findings: RootCauseFinding[];
  evidence: EvidenceSentence[];
  /** In-window adjudication rows behind the payer-history feature. */
  payerSampleSize: number;
}

export interface PreflightTile {
  label: string;
  value: string;
  tone: StatCardTone;
  hint?: string;
}

// ---------------------------------------------------------------------------
// Disposition + category vocab (soft pastel --status-* tokens)
// ---------------------------------------------------------------------------

const DISPOSITION_PILL: Record<Disposition, { label: string; className: string }> = {
  hold: { label: "Hold", className: "bg-status-alert-bg text-status-alert-fg" },
  review: { label: "Review", className: "bg-status-link-bg text-status-link-fg" },
  release: {
    label: "Release",
    className: "bg-status-positive-bg text-status-positive-fg",
  },
};

const GAUGE_COLOR: Record<Disposition, string> = {
  hold: "var(--status-alert-fg)",
  review: "var(--status-link-fg)",
  release: "var(--status-positive-fg)",
};

const CATEGORY_LABEL: Record<DeficiencyCategory, string> = {
  modifier_deficiency: "Modifier deficiency",
  medical_necessity_deficit: "Medical necessity",
  unbundling_conflict: "Unbundling conflict",
  payer_history_risk: "Payer history",
  documentation_quality: "Documentation quality",
};

function formatPct(score: number): string {
  return `${Math.round(score * 100)}%`;
}

// ---------------------------------------------------------------------------
// Risk gauge — P_denial as a semicircular arc
// ---------------------------------------------------------------------------

function RiskGauge({ score, disposition }: { score: number; disposition: Disposition }) {
  // Semicircle of radius 28 → arc length π·28.
  const ARC = Math.PI * 28;
  const filled = Math.min(1, Math.max(0, score)) * ARC;
  return (
    <div
      className="relative shrink-0"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(score * 100)}
      aria-label={`Denial probability ${formatPct(score)}`}
    >
      <svg width="76" height="46" viewBox="0 0 76 46" aria-hidden="true">
        <path
          d="M 10 42 A 28 28 0 0 1 66 42"
          fill="none"
          stroke="var(--surface-muted)"
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M 10 42 A 28 28 0 0 1 66 42"
          fill="none"
          stroke={GAUGE_COLOR[disposition]}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${ARC}`}
          className="transition-all duration-500 ease-smooth"
        />
      </svg>
      <div className="absolute inset-x-0 bottom-0 text-center">
        <span className="font-display text-sm text-text tabular-nums">
          {formatPct(score)}
        </span>
      </div>
    </div>
  );
}

function DispositionPill({ disposition }: { disposition: Disposition }) {
  const pill = DISPOSITION_PILL[disposition];
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium tracking-wide",
        pill.className,
      )}
    >
      {pill.label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Per-row state after a one-click fix
// ---------------------------------------------------------------------------

interface RowOverride {
  beforeScore: number;
  score: number;
  disposition: Disposition;
  released: boolean;
  findings: RootCauseFinding[];
  cptDisplay: string[];
}

interface WorklistProps {
  rows: PreflightRow[];
  tiles: PreflightTile[];
}

export function PreflightWorklist({ rows, tiles }: WorklistProps) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, RowOverride>>({});
  // The riskiest claim starts expanded so the first fix is a single click.
  const [expandedId, setExpandedId] = useState<string | null>(
    rows.length > 0 && rows[0].disposition !== "release" ? rows[0].id : null,
  );
  const [evidenceOpenId, setEvidenceOpenId] = useState<string | null>(null);

  const remediate = (row: PreflightRow, input: RemediationInput, key: string) => {
    setPendingKey(key);
    startTransition(async () => {
      const result = await applyPreflightRemediation(input);
      setPendingKey(null);
      if (!result.ok) {
        toast({ title: "Couldn't apply the fix", description: result.error, variant: "error" });
        return;
      }
      setOverrides((prev) => ({
        ...prev,
        [row.id]: {
          // Keep the ORIGINAL score across successive fixes on one claim.
          beforeScore: prev[row.id]?.beforeScore ?? row.score,
          score: result.afterScore,
          disposition: result.afterDisposition,
          released: result.released,
          findings: result.findings,
          cptDisplay: result.cptDisplay,
        },
      }));
      toast({
        title: result.released ? "Released to submission" : "Claim re-scored",
        description: result.message,
        variant: result.released ? "success" : "info",
      });
    });
  };

  if (rows.length === 0) {
    return (
      <div className="space-y-6">
        <TileGrid tiles={tiles} />
        <EmptyState
          icon={<Sparkles className="w-8 h-8 text-accent" />}
          title="Nothing in pre-flight"
          description="Every pre-submission claim is clear. New drafts and scrubbed claims land here automatically for a denial-risk check before the 837 goes out."
        />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <TileGrid tiles={tiles} />

      <section aria-label="Pre-flight worklist" className="space-y-4">
        <h2 className="font-display text-lg text-text tracking-tight">
          Claims, riskiest first
        </h2>

        {rows.map((row) => {
          const ov = overrides[row.id];
          const score = ov?.score ?? row.score;
          const disposition = ov?.disposition ?? row.disposition;
          const findings = ov?.findings ?? row.findings;
          const cptDisplay = ov?.cptDisplay ?? row.cptDisplay;
          const expanded = expandedId === row.id;
          const evidenceOpen = evidenceOpenId === row.id;

          return (
            <Card key={row.id} tone="raised">
              <CardContent className="p-0">
                {/* Row header — one click to expand */}
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : row.id)}
                  aria-expanded={expanded}
                  className="w-full flex items-center gap-5 px-6 py-5 text-left rounded-xl hover:bg-surface-muted/50 transition-colors"
                >
                  <RiskGauge score={score} disposition={disposition} />

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-medium text-text">{row.patientName}</span>
                      <DispositionPill disposition={disposition} />
                      {ov && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-status-positive-bg text-status-positive-fg tabular-nums">
                          {formatPct(ov.beforeScore)} → {formatPct(ov.score)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 text-[13px] text-text-muted flex items-center gap-2 flex-wrap">
                      <span>{row.payerName ?? "No payer"}</span>
                      <span aria-hidden="true">·</span>
                      <span>{row.serviceDateLabel}</span>
                      <span aria-hidden="true">·</span>
                      <span>{row.billedLabel}</span>
                      {row.claimNumber && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>#{row.claimNumber}</span>
                        </>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                      {cptDisplay.map((c) => (
                        <Badge key={c} tone="neutral">{c}</Badge>
                      ))}
                      {row.icdDisplay.map((c) => (
                        <Badge key={c} tone="accent">{c}</Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-[12px] text-text-muted hidden md:block">
                      {findings.length === 0
                        ? "No findings"
                        : `${findings.length} finding${findings.length === 1 ? "" : "s"}`}
                    </span>
                    <ChevronDown
                      className={cn(
                        "w-4 h-4 text-text-muted transition-transform duration-200",
                        expanded && "rotate-180",
                      )}
                    />
                  </div>
                </button>

                {/* Expanded detail — findings + inline evidence, no pop-ups */}
                {expanded && (
                  <div className="px-6 pb-6 pt-1 space-y-4 border-t border-border/60">
                    {(ov?.released || (disposition === "release" && ov)) && (
                      <div className="mt-4 flex items-center gap-2 rounded-lg bg-status-positive-bg text-status-positive-fg px-4 py-3 text-sm font-medium">
                        <Sparkles className="w-4 h-4 shrink-0" />
                        Released to submission — P(denial) is in the green zone
                        (&lt; 10%). The 837 compiler will pick it up.
                      </div>
                    )}

                    {findings.length === 0 ? (
                      <p className="mt-4 text-sm text-text-muted">
                        No root-cause findings — this claim scores{" "}
                        {formatPct(score)} on payer history and documentation
                        signals alone.
                      </p>
                    ) : (
                      <ol className="mt-4 space-y-3" aria-label="Ranked root causes">
                        {findings.map((finding, idx) => (
                          <li
                            key={`${finding.category}-${idx}`}
                            className="rounded-lg border border-border/70 bg-surface px-5 py-4"
                          >
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-medium text-text-muted tabular-nums">
                                #{idx + 1}
                              </span>
                              <Badge tone={finding.category === "unbundling_conflict" || finding.category === "modifier_deficiency" ? "warning" : "neutral"}>
                                {CATEGORY_LABEL[finding.category]}
                              </Badge>
                              <span className="text-[11px] text-text-muted tabular-nums">
                                +{finding.contribution.toFixed(2)} logits
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-text leading-relaxed">
                              {finding.summary}
                            </p>
                            <p className="mt-1.5 text-[13px] text-text-muted leading-relaxed">
                              {finding.remediation}
                            </p>
                            <RemediationButton
                              row={row}
                              finding={finding}
                              index={idx}
                              pendingKey={pendingKey}
                              isPending={isPending}
                              onRemediate={remediate}
                            />
                          </li>
                        ))}
                      </ol>
                    )}

                    {/* Context-aware evidence — inline expanding section */}
                    <div className="rounded-lg border border-border/70 bg-surface">
                      <button
                        type="button"
                        onClick={() =>
                          setEvidenceOpenId(evidenceOpen ? null : row.id)
                        }
                        aria-expanded={evidenceOpen}
                        className="w-full flex items-center gap-2 px-5 py-3.5 text-left text-sm font-medium text-text hover:bg-surface-muted/50 transition-colors rounded-lg"
                      >
                        <FileText className="w-4 h-4 text-text-muted shrink-0" />
                        Review narrative note context
                        <ChevronDown
                          className={cn(
                            "w-4 h-4 text-text-muted ml-auto transition-transform duration-200",
                            evidenceOpen && "rotate-180",
                          )}
                        />
                      </button>
                      {evidenceOpen && (
                        <div className="px-5 pb-5 pt-1">
                          {row.evidence.length === 0 ? (
                            <p className="text-[13px] text-text-muted leading-relaxed">
                              No narrative note is attached to this encounter —
                              the documentation features scored it as thin.
                            </p>
                          ) : (
                            <p className="text-[13px] text-text leading-[1.9]">
                              {row.evidence.map((sentence, i) => (
                                <React.Fragment key={i}>
                                  {sentence.highlight ? (
                                    <mark
                                      title={`Matches: ${sentence.matchedTerms.join(", ")}`}
                                      className="bg-status-link-bg text-status-link-fg rounded px-1 py-0.5 box-decoration-clone"
                                    >
                                      {sentence.text}
                                    </mark>
                                  ) : (
                                    <span className="text-text-muted">
                                      {sentence.text}
                                    </span>
                                  )}{" "}
                                </React.Fragment>
                              ))}
                            </p>
                          )}
                          {row.payerSampleSize > 0 && (
                            <p className="mt-3 text-[11px] text-text-muted">
                              Payer history: {row.payerSampleSize} adjudicated
                              outcome{row.payerSampleSize === 1 ? "" : "s"} for
                              the riskiest CPT in the last 180 days.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// One-click remediation button (machine-applicable actions only)
// ---------------------------------------------------------------------------

function RemediationButton({
  row,
  finding,
  index,
  pendingKey,
  isPending,
  onRemediate,
}: {
  row: PreflightRow;
  finding: RootCauseFinding;
  index: number;
  pendingKey: string | null;
  isPending: boolean;
  onRemediate: (row: PreflightRow, input: RemediationInput, key: string) => void;
}) {
  const action = finding.action;
  let input: RemediationInput | null = null;
  let label = "";

  if (action.kind === "append_modifier") {
    input = {
      kind: "append_modifier",
      claimId: row.id,
      targetCode: action.targetCode,
      modifier: action.modifier,
    };
    label = `Append Modifier-${action.modifier} to ${action.targetCode}`;
  } else if (action.kind === "remove_line") {
    input = {
      kind: "remove_line",
      claimId: row.id,
      componentCode: action.componentCode,
    };
    label = `Remove ${action.componentCode} line item`;
  }

  if (!input) {
    // augment_documentation / manual_review stay human-in-the-loop — the
    // remediation text above tells the biller exactly what to document.
    return (
      <p className="mt-3 text-[11px] text-text-muted inline-flex items-center gap-1.5">
        <Wrench className="w-3 h-3" />
        Manual step — apply in the chart, then re-open Pre-Flight.
      </p>
    );
  }

  const key = `${row.id}:${index}`;
  const busy = isPending && pendingKey === key;
  const frozen = input; // narrow for the closure

  return (
    <div className="mt-3">
      <Button
        size="sm"
        variant="primary"
        disabled={isPending}
        onClick={(e) => {
          e.stopPropagation();
          onRemediate(row, frozen, key);
        }}
        leadingIcon={<Wrench className="w-3.5 h-3.5" />}
      >
        {busy ? "Re-scoring…" : label}
      </Button>
    </div>
  );
}

// ---------------------------------------------------------------------------

function TileGrid({ tiles }: { tiles: PreflightTile[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {tiles.map((t) => (
        <StatCard
          key={t.label}
          label={t.label}
          value={t.value}
          hint={t.hint}
          tone={t.tone}
        />
      ))}
    </div>
  );
}
