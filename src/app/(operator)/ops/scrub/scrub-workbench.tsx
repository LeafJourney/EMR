"use client";

/**
 * EMR-968 + EMR-975 + EMR-979 + EMR-952 — interactive shell for the
 * Claim Scrub Workbench ("Scrub and Auths").
 *
 * EMR-968: the top stat tiles are clickable. Selecting a tile smooth-scrolls
 *          down to the "Claims requiring review" list, filters that list to
 *          the tile's bucket, and re-titles the section header to match.
 * EMR-975: a filter button to the right of the section title opens a popup
 *          (ModalShell) for searching historical / chronological claims data
 *          across every bucket (patient, claim #, CPT, payer + status filter).
 * EMR-979: "Top issues this week" is interactive — each count bubble is a
 *          button that filters the review list to that ruleCode's occurrences,
 *          re-titles the section to the root cause, orders chronologically, and
 *          carries a hover tooltip explaining how the AI "Cindy" keeps learning.
 * EMR-952: a "Prior Authorization" button opens a fully editable PA form with
 *          an engine/plug-in selector populated from the adapter registry.
 * EMR-962: the "Warnings" tile renders with a slightly lighter yellow value.
 */

import * as React from "react";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Filter, Search, FileCheck2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/ornament";
import { StatCard } from "@/components/ui/stat-card";
import { ModalShell } from "@/components/ui/modal-shell";
import { Input } from "@/components/ui/input";
import { Tooltip } from "@/components/ui/tooltip";
import { useToast } from "@/components/ui/toast";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { ScrubIssue, ScrubSeverity } from "@/lib/billing/scrub";
import {
  assemblePriorAuthPacket,
  validateForSubmission,
} from "@/lib/billing/prior-auth";

// ---------------------------------------------------------------------------
// Serialized prop shapes (Date → ISO string, Decimal → Number on the server)
// ---------------------------------------------------------------------------

export interface SerializedScrubClaim {
  id: string;
  claimNumber: string | null;
  status: string;
  serviceDateIso: string;
  payerName: string | null;
  billedAmountCents: number;
  patient: { id: string; firstName: string; lastName: string };
  cptCodes: Array<{ code: string }>;
  icd10Codes: Array<{ code: string }>;
  issues: ScrubIssue[];
  counts: Record<ScrubSeverity, number>;
  submittable: boolean;
}

export interface HistoricalClaim {
  id: string;
  claimNumber: string | null;
  status: string;
  serviceDateIso: string;
  payerName: string | null;
  billedAmountCents: number;
  patientName: string;
  patientId: string;
  cptCodes: string[];
  reason: string;
}

export type TileKey = "queue" | "clean" | "blocked" | "errors" | "warnings";

interface TileStat {
  key: TileKey;
  label: string;
  value: string;
  tone: "neutral" | "success" | "warning" | "danger";
  hint?: string;
}

/** EMR-979 — a single "top issue this week" root cause. */
export interface TopIssue {
  ruleCode: string;
  count: number;
  /** Humanized rule code (computed on the server). */
  label: string;
}

/** EMR-952 — one PA engine/plug-in surfaced from the adapter registry. */
export interface PaEngineOption {
  id: string;
  displayName: string;
  supportedPayers: string[];
}

interface ScrubWorkbenchProps {
  scrubbed: SerializedScrubClaim[];
  historical: HistoricalClaim[];
  tiles: TileStat[];
  /** EMR-979 — interactive "Top issues this week" root causes. */
  topIssues: TopIssue[];
  /** EMR-952 — engine/plug-in registry for the Prior Authorization hub. */
  paEngines: PaEngineOption[];
  /** Title to show on the lower section when no tile is selected. */
  defaultSectionTitle: string;
}

// ---------------------------------------------------------------------------
// Per-tile subset predicate. Mirrors the count logic on the server so the
// filtered list is always consistent with the number shown on the tile.
//   queue    → every claim in the scrub queue
//   clean    → claims with zero issues (cleanClaims)
//   blocked  → claims that are not submittable (blockedClaims)
//   errors   → claims carrying ≥1 error-severity issue (totalErrors source)
//   warnings → claims carrying ≥1 warning-severity issue (totalWarnings source)
// ---------------------------------------------------------------------------

function tileMatches(key: TileKey, c: SerializedScrubClaim): boolean {
  switch (key) {
    case "queue":
      return true;
    case "clean":
      return c.issues.length === 0;
    case "blocked":
      return !c.submittable;
    case "errors":
      return c.counts.error > 0;
    case "warnings":
      return c.counts.warning > 0;
  }
}

const TILE_SECTION_TITLE: Record<TileKey, string> = {
  queue: "Claims requiring review",
  clean: "Reviewed and ready",
  blocked: "Blocked",
  errors: "Errors",
  warnings: "Warnings",
};

const SEVERITY_COLORS: Record<string, string> = {
  error: "var(--danger)",
  warning: "var(--warning)",
  info: "var(--info)",
};

// ---------------------------------------------------------------------------
// EMR-979 — per-rule plain-language root-cause explanations. Each one notes
// how the AI "Cindy" learns from accumulated scrub outcomes and improves over
// time. Shown as a hover tooltip on the "Top issues this week" bubbles.
// ---------------------------------------------------------------------------

const CINDY_GENERIC_EXPLANATION =
  "This is a recurring root cause across recent claims. Cindy, our billing AI, keeps learning from every claim you fix and gets better at catching it upstream over time.";

const RULE_EXPLANATIONS: Record<string, string> = {
  MISSING_CPT:
    "Claims arrived without a billable service code. Cindy watches which encounters tend to drop their CPT and is learning to pre-fill the right one from the visit note so this stops happening.",
  MISSING_DIAGNOSIS:
    "No ICD-10 was linked to justify medical necessity. Cindy studies your diagnosis patterns by visit type and keeps improving its suggestions so the correct dx is attached automatically.",
  MISSING_PAYER:
    "These claims have no payer assigned. Cindy learns from how your team resolves coverage and gets steadily better at routing the right insurance or flagging self-pay up front.",
  MISSING_PROVIDER:
    "No rendering provider was set. Cindy is learning to infer the signing clinician from the encounter so it can pre-populate this field going forward.",
  MISSING_CHARGE_AMOUNT:
    "A CPT line had no fee. Cindy reconciles against your fee schedule every cycle and keeps learning the gaps so charges populate without manual lookup.",
  NCCI_BUNDLED_PAIR:
    "Code pairs that payers bundle together keep appearing. Cindy ingests each NCCI outcome and improves at suggesting the right modifier (or dropping the line) before submission.",
  MUE_EXCEEDED:
    "Unit counts exceeded the per-day medically-unlikely limit. Cindy learns each payer's real-world caps from accepted claims and warns earlier as it sees more data.",
  PAST_TIMELY_FILING:
    "Claims aged past the payer's filing window. Cindy tracks each payer's deadlines and is learning to nudge these to the front of the queue before they lapse.",
  APPROACHING_TIMELY_FILING:
    "Claims are nearing their filing deadline. Cindy keeps refining its timing model from your submission history so it surfaces at-risk claims sooner each week.",
  HIGH_LEVEL_EM_REVIEW:
    "High-level E/M codes need strong documentation. Cindy compares your notes to level requirements and keeps getting better at flagging under-documented visits.",
  UNRECOGNIZED_EM_CODE:
    "A 99xxx code didn't match the standard E/M set. Cindy learns your legitimate less-common codes over time so it stops flagging the ones you actually use.",
  ELIGIBILITY_NOT_ACTIVE:
    "Coverage wasn't active at service time. Cindy correlates eligibility checks with denials and improves at prompting re-verification before you submit.",
  MISSING_PRIOR_AUTH:
    "A service needed prior auth with none on file. Cindy learns which payer/service combos require PA and increasingly opens the PA task for you automatically.",
  CANNABIS_PA_HOLD:
    "Cannabis services were held pending prior authorization. Cindy is learning each payer's cannabis PA rules so it can pre-stage the packet from the chart.",
  CANNABIS_PAYER_EXCLUDES:
    "The payer excludes cannabis services outright. Cindy tracks these exclusions and gets better at routing the encounter straight to self-pay.",
  COUNSELING_NO_MEDICAL_DX:
    "Counseling-only claims lacked a supporting medical diagnosis. Cindy learns the underlying conditions you treat and improves at suggesting the right primary dx.",
};

function explainRule(ruleCode: string): string {
  return RULE_EXPLANATIONS[ruleCode] ?? CINDY_GENERIC_EXPLANATION;
}

// EMR-979 — does this claim carry an issue with the given ruleCode?
function claimHasRule(c: SerializedScrubClaim, ruleCode: string): boolean {
  return c.issues.some((i) => i.ruleCode === ruleCode);
}

// ---------------------------------------------------------------------------

export function ScrubWorkbench({
  scrubbed,
  historical,
  tiles,
  topIssues,
  paEngines,
  defaultSectionTitle,
}: ScrubWorkbenchProps) {
  const [selected, setSelected] = useState<TileKey | null>(null);
  // EMR-979 — the active "top issue" root cause filter (mutually exclusive with
  // the tile filter; selecting one clears the other).
  const [ruleFilter, setRuleFilter] = useState<TopIssue | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [paOpen, setPaOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  function scrollToList() {
    requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function handleTileClick(key: TileKey) {
    setRuleFilter(null);
    setSelected((prev) => (prev === key ? null : key));
    scrollToList();
  }

  // EMR-979 — clicking a count bubble filters to that root cause.
  function handleRuleClick(issue: TopIssue) {
    setSelected(null);
    setRuleFilter((prev) => (prev?.ruleCode === issue.ruleCode ? null : issue));
    scrollToList();
  }

  function clearFilters() {
    setSelected(null);
    setRuleFilter(null);
  }

  const filtered = useMemo(() => {
    if (ruleFilter) {
      // Filter to occurrences of the chosen ruleCode, ordered chronologically
      // (oldest service date first — fix the longest-waiting claims upstream).
      return scrubbed
        .filter((c) => claimHasRule(c, ruleFilter.ruleCode))
        .slice()
        .sort(
          (a, b) =>
            new Date(a.serviceDateIso).getTime() -
            new Date(b.serviceDateIso).getTime(),
        );
    }
    if (selected) return scrubbed.filter((c) => tileMatches(selected, c));
    return scrubbed;
  }, [ruleFilter, selected, scrubbed]);

  const sectionTitle = ruleFilter
    ? ruleFilter.label
    : selected
      ? TILE_SECTION_TITLE[selected]
      : defaultSectionTitle;

  const hasFilter = ruleFilter != null || selected != null;

  return (
    <>
      {/* Top stats — clickable (EMR-968). EMR-962: the Warnings tile gets a
          slightly lighter yellow value via a local override. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
        {tiles.map((tile) => {
          const isActive = selected === tile.key;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => handleTileClick(tile.key)}
              aria-pressed={isActive}
              className={cn(
                "text-left rounded-2xl transition-all focus-visible:outline-none",
                "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
                "hover:-translate-y-0.5",
                isActive
                  ? "ring-2 ring-accent ring-offset-1"
                  : "ring-0",
              )}
            >
              {tile.key === "warnings" ? (
                <WarningsTile label={tile.label} value={tile.value} hint={tile.hint} />
              ) : (
                <StatCard
                  label={tile.label}
                  value={tile.value}
                  tone={tile.tone}
                  hint={tile.hint}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* EMR-952 — Prior Authorization hub launcher */}
      <div className="mb-8 flex justify-end">
        <button
          type="button"
          onClick={() => setPaOpen(true)}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold",
            "bg-accent text-accent-ink shadow-sm hover:bg-accent/90 transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
          )}
        >
          <FileCheck2 className="w-4 h-4" aria-hidden="true" />
          Prior Authorization
        </button>
      </div>

      {/* EMR-979 — "Top issues this week" — interactive root-cause filters */}
      {topIssues.length > 0 && (
        <Card tone="raised" className="mb-8">
          <CardContent className="pt-5 pb-5">
            <div className="mb-1">
              <h3 className="text-base font-display text-text">Top issues this week</h3>
              <p className="text-sm text-text-muted">
                Tap a root cause to filter the list below. Fixing these upstream
                prevents them from coming back.
              </p>
            </div>
            <div className="space-y-2 mt-3">
              {topIssues.map((issue) => {
                const isActive = ruleFilter?.ruleCode === issue.ruleCode;
                return (
                  <Tooltip key={issue.ruleCode} content={explainRule(issue.ruleCode)} side="top">
                    <button
                      type="button"
                      onClick={() => handleRuleClick(issue)}
                      aria-pressed={isActive}
                      className={cn(
                        "w-full flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left",
                        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
                        isActive
                          ? "bg-accent/10 ring-1 ring-accent"
                          : "hover:bg-surface-muted",
                      )}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[10px] text-text-subtle shrink-0">
                          {issue.ruleCode}
                        </span>
                        <span className="text-sm text-text truncate">
                          {issue.label}
                        </span>
                      </span>
                      <Badge tone="warning" className="shrink-0">
                        {issue.count} occurrences
                      </Badge>
                    </button>
                  </Tooltip>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section header + filter affordance (EMR-975) */}
      <div ref={listRef} className="scroll-mt-6 mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Eyebrow>{sectionTitle}</Eyebrow>
          {ruleFilter && (
            <span className="text-[11px] text-text-subtle">
              {filtered.length} occurrence{filtered.length !== 1 ? "s" : ""} · oldest first
            </span>
          )}
          {hasFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-[11px] text-text-muted hover:text-text underline underline-offset-2"
            >
              Clear filter
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          aria-label="Search claims history"
          className={cn(
            "shrink-0 h-8 w-8 rounded-full flex items-center justify-center",
            "bg-surface-muted hover:bg-surface-raised text-text-muted hover:text-text",
            "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
          )}
        >
          <Filter className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {scrubbed.length === 0 ? (
        <EmptyState
          title="No claims in scrub queue"
          description="When new visit notes are finalized, draft claims will appear here for review."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={`No ${sectionTitle.toLowerCase()} claims`}
          description="Nothing matches this filter right now. Clear the filter to see the full queue."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((claim) => (
            <ClaimRow
              key={claim.id}
              claim={claim}
              highlightRule={ruleFilter?.ruleCode ?? null}
            />
          ))}
        </div>
      )}

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        historical={historical}
      />

      <PriorAuthModal
        open={paOpen}
        onClose={() => setPaOpen(false)}
        engines={paEngines}
        claims={scrubbed}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// EMR-962 — local "Warnings" tile with a slightly lighter yellow value.
// StatCard is a shared component and can't be edited; this mirrors its markup
// (Card + CardContent) but swaps the value color for a lighter amber so the
// Warnings number reads softer than the danger/error tiles.
// ---------------------------------------------------------------------------

function WarningsTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <p className="text-xs text-text-subtle uppercase tracking-wider">{label}</p>
        <p
          className="font-display tabular-nums mt-1 text-3xl text-amber-400"
        >
          {value}
        </p>
        {hint && <p className="text-[10px] text-text-subtle mt-1.5">{hint}</p>}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Claim card — preserves the original server markup verbatim.
// ---------------------------------------------------------------------------

function ClaimRow({
  claim,
  highlightRule = null,
}: {
  claim: SerializedScrubClaim;
  /** EMR-979 — when a root-cause filter is active, sort its issues first. */
  highlightRule?: string | null;
}) {
  const { counts, submittable } = claim;
  // EMR-978 — red badge when a claim nears (or passes) the payer's timely-filing
  // window. 90-day window as a conservative default; ≤30 days left is urgent.
  const FILING_WINDOW_DAYS = 90;
  const daysSinceService = Math.floor(
    (Date.now() - new Date(claim.serviceDateIso).getTime()) / 86_400_000,
  );
  const filingDaysLeft = FILING_WINDOW_DAYS - daysSinceService;
  const filingUrgent = filingDaysLeft <= 30;
  // EMR-979 — when filtering by root cause, float the matching issue(s) up.
  const issues = highlightRule
    ? claim.issues
        .slice()
        .sort((a, b) => {
          const am = a.ruleCode === highlightRule ? 0 : 1;
          const bm = b.ruleCode === highlightRule ? 0 : 1;
          return am - bm;
        })
    : claim.issues;
  return (
    <Card
      tone="raised"
      className={
        !submittable
          ? "border-l-4 border-l-danger"
          : issues.length > 0
            ? "border-l-4 border-l-[color:var(--warning)]"
            : "border-l-4 border-l-success"
      }
    >
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Avatar
              firstName={claim.patient.firstName}
              lastName={claim.patient.lastName}
              size="md"
            />
            <div>
              <Link
                href={`/clinic/patients/${claim.patient.id}`}
                className="text-sm font-semibold text-text hover:text-accent transition-colors"
              >
                {claim.patient.firstName} {claim.patient.lastName}
              </Link>
              {/* EMR-984: larger/darker date·insurance·CLM */}
              <p className="text-xs font-semibold text-text-muted mt-0.5">
                {formatDate(claim.serviceDateIso)} ·{" "}
                {claim.payerName ?? "No payer"} · {claim.claimNumber ?? "No CLM #"}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-xl text-text font-semibold tabular-nums">
              {formatMoney(claim.billedAmountCents)}
            </p>
            <div className="flex items-center gap-1 mt-1">
              {filingUrgent && (
                <Badge tone="danger" className="text-[9px] font-semibold">
                  {filingDaysLeft <= 0 ? "Filing lapsed" : `Filing: ${filingDaysLeft}d`}
                </Badge>
              )}
              {counts.error > 0 && (
                <Badge tone="danger" className="text-[9px] font-semibold">
                  {counts.error} error
                  {counts.error !== 1 ? "s" : ""}
                </Badge>
              )}
              {counts.warning > 0 && (
                <Badge tone="warning" className="text-[9px] font-semibold">
                  {counts.warning} warning
                  {counts.warning !== 1 ? "s" : ""}
                </Badge>
              )}
              {counts.info > 0 && (
                <Badge tone="info" className="text-[9px] font-semibold">
                  {counts.info} info
                </Badge>
              )}
              {issues.length === 0 && (
                <Badge tone="success" className="text-[9.5px] font-semibold">
                  Reviewed and ready
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* CPT + ICD codes (EMR-984: larger CPT/ICD codes) */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {claim.cptCodes.map((c) => (
            <span
              key={c.code}
              className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-mono bg-accent/10 text-accent font-semibold"
            >
              {c.code}
            </span>
          ))}
          {claim.icd10Codes.map((c) => (
            <span
              key={c.code}
              className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-mono bg-highlight/10 text-[color:var(--highlight)] font-semibold"
            >
              {c.code}
            </span>
          ))}
        </div>

        {/* Issues */}
        {issues.length > 0 && (
          <div className="space-y-2 mb-4">
            {issues.map((issue, i) => (
              <IssueRow
                key={i}
                issue={issue}
                patientId={claim.patient.id}
                emphasized={highlightRule != null && issue.ruleCode === highlightRule}
              />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Link
            href={`/clinic/patients/${claim.patient.id}/billing`}
            className="text-xs text-text-subtle hover:text-text font-semibold"
          >
            Open billing
          </Link>
          <button
            disabled={!submittable}
            className={`text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${
              submittable
                ? "bg-accent text-accent-ink hover:bg-accent/90 shadow-sm"
                : "bg-surface-muted text-text-subtle cursor-not-allowed"
            }`}
          >
            {submittable ? "Submit claim" : "Blocked — fix errors"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}

function IssueRow({
  issue,
  patientId,
  emphasized = false,
}: {
  issue: ScrubIssue;
  patientId: string;
  /** EMR-979 — the issue that matches the active root-cause filter. */
  emphasized?: boolean;
}) {
  const isWarning = issue.severity === "warning";

  // EMR-984: deep-link each major ruleCode to its specific editable surface in
  // the chart/billing area instead of the generic billing fallback. We use
  // query params + anchors so the target lands on the exact editable section.
  const base = `/clinic/patients/${patientId}`;
  const billing = `${base}/billing`;
  // The related CPT/ICD makes the deep link land on the exact code line.
  const codeQuery = issue.relatedCode
    ? `&code=${encodeURIComponent(issue.relatedCode)}`
    : "";

  const deepLinks: Record<string, string> = {
    // Coding — CPT/diagnosis live on the charge-capture / coding surface.
    MISSING_CPT: `${billing}?tab=codes&focus=cpt#charge-capture`,
    MISSING_DIAGNOSIS: `${base}?tab=problems&action=add-diagnosis#diagnoses`,
    missing_diagnosis: `${base}?tab=problems&action=add-diagnosis#diagnoses`,
    COUNSELING_NO_MEDICAL_DX: `${base}?tab=problems&action=add-diagnosis#diagnoses`,
    // NCCI / MUE — line-level edits on the claim's charge lines.
    NCCI_BUNDLED_PAIR: `${billing}?tab=codes&focus=modifiers${codeQuery}#charge-capture`,
    MUE_EXCEEDED: `${billing}?tab=codes&focus=units${codeQuery}#charge-capture`,
    // Charge amount — fee-schedule line on the claim.
    MISSING_CHARGE_AMOUNT: `${billing}?tab=codes&focus=charges${codeQuery}#charge-capture`,
    // Payer / coverage — the patient's insurance record.
    MISSING_PAYER: `${base}?tab=insurance&action=assign-payer#coverage`,
    ELIGIBILITY_NOT_ACTIVE: `${base}?tab=insurance&action=verify-eligibility#coverage`,
    CANNABIS_PAYER_EXCLUDES: `${base}?tab=insurance&action=route-self-pay#coverage`,
    // Prior auth — the claim's authorization block.
    MISSING_PRIOR_AUTH: `${billing}?tab=auth#prior-auth`,
    CANNABIS_PA_HOLD: `${billing}?tab=auth#prior-auth`,
    // Timely filing — the claim header / submission status.
    PAST_TIMELY_FILING: `${billing}?tab=status&focus=timely-filing#claim-status`,
    APPROACHING_TIMELY_FILING: `${billing}?tab=status&focus=timely-filing#claim-status`,
    "timely-filing": `${billing}?tab=status&focus=timely-filing#claim-status`,
    // E/M level — back to the encounter note where the level is set.
    HIGH_LEVEL_EM_REVIEW: `${base}?tab=encounters&focus=em-level${codeQuery}#visit-note`,
    UNRECOGNIZED_EM_CODE: `${base}?tab=encounters&focus=em-level${codeQuery}#visit-note`,
    "em-level": `${base}?tab=encounters&focus=em-level#visit-note`,
    // Rendering provider — the claim header.
    MISSING_PROVIDER: `${billing}?tab=header&focus=rendering-provider#claim-header`,
  };
  const targetPath = deepLinks[issue.ruleCode] ?? billing;

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border",
        isWarning
          ? "bg-amber-50/50 border-amber-200/60 text-amber-900"
          : issue.severity === "error"
            ? "bg-red-50/45 border-red-100 text-red-955"
            : "bg-surface-muted/40 border-border text-text",
        // EMR-979 — highlight the issue that matches the active root-cause filter.
        emphasized && "ring-2 ring-accent ring-offset-1",
      )}
      style={
        !isWarning && issue.severity !== "error"
          ? { borderLeft: `3px solid ${SEVERITY_COLORS[issue.severity]}` }
          : undefined
      }
    >
      <div className="shrink-0 pt-0.5">
        <span
          className={cn(
            "inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold text-white shadow-sm",
            isWarning 
              ? "bg-amber-500" 
              : issue.severity === "error" 
                ? "bg-red-500" 
                : "bg-blue-500"
          )}
        >
          {issue.severity === "error" ? "!" : issue.severity === "warning" ? "?" : "i"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono text-text-subtle uppercase font-semibold">
            {issue.ruleCode}
          </span>
          {issue.relatedCode && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent font-semibold">
              {issue.relatedCode}
            </span>
          )}
        </div>
        <p className="text-xs font-semibold leading-snug">{issue.message}</p>
        <p className="text-xs opacity-80 mt-1 leading-snug font-medium">
          → {issue.suggestion}
        </p>
        {/* EMR-984: deep-link fix suggestions */}
        <div className="mt-2">
          <Link
            href={targetPath}
            className={cn(
              "inline-flex items-center gap-0.5 text-[11px] font-bold transition-colors hover:underline",
              isWarning 
                ? "text-amber-800 hover:text-amber-950" 
                : issue.severity === "error"
                  ? "text-red-800 hover:text-red-950"
                  : "text-accent hover:text-accent-ink"
            )}
          >
            Fix in chart →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EMR-975 — historical / chronological search modal
// ---------------------------------------------------------------------------

const STATUS_TONE: Record<string, "neutral" | "accent" | "success" | "warning" | "danger" | "info"> = {
  draft: "neutral",
  submitted: "info",
  accepted: "info",
  paid: "success",
  denied: "danger",
  appealed: "warning",
  closed: "neutral",
  void: "neutral",
};

function statusLabel(status: string): string {
  return status
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function SearchModal({
  open,
  onClose,
  historical,
}: {
  open: boolean;
  onClose: () => void;
  historical: HistoricalClaim[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const statuses = useMemo(() => {
    const set = new Set(historical.map((h) => h.status));
    return Array.from(set).sort();
  }, [historical]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return historical
      .filter((h) => statusFilter === "all" || h.status === statusFilter)
      .filter((h) => {
        if (!q) return true;
        const haystack = [
          h.patientName,
          h.claimNumber ?? "",
          h.payerName ?? "",
          ...h.cptCodes,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(q);
      })
      // Chronological — most recent service date first.
      .sort(
        (a, b) =>
          new Date(b.serviceDateIso).getTime() -
          new Date(a.serviceDateIso).getTime(),
      );
  }, [historical, query, statusFilter]);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      placement="center"
      maxWidth="max-w-2xl"
      eyebrow="Claims management"
      title="Search claims history"
      description="Search across every bucket — queue, ready, blocked, errors, warnings, and submitted/paid/denied history."
    >
      <div className="px-6 py-5 space-y-4">
        {/* Search controls */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle pointer-events-none" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Patient name, claim #, CPT, or payer…"
              className="pl-9"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className={cn(
              "h-10 rounded-md border border-border-strong bg-surface px-3 text-sm text-text",
              "transition-colors duration-200 focus:outline-none",
              "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30",
              "sm:w-44",
            )}
          >
            <option value="all">All buckets</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </div>

        <p className="text-[11px] text-text-subtle">
          {results.length} result{results.length !== 1 ? "s" : ""} · newest
          first · {historical.length} claims loaded
        </p>

        {/* Results — chronological */}
        {results.length === 0 ? (
          <div className="py-10 text-center text-sm text-text-muted">
            No claims match your search.
          </div>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {results.map((r) => (
              <Link
                key={r.id}
                href={`/clinic/patients/${r.patientId}/billing`}
                onClick={onClose}
                className="block rounded-xl border border-border bg-surface-raised px-4 py-3 hover:border-accent/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text truncate">
                      {r.patientName}
                    </p>
                    <p className="text-[11px] text-text-subtle mt-0.5">
                      {formatDate(r.serviceDateIso)} ·{" "}
                      {r.payerName ?? "No payer"} · {r.claimNumber ?? "—"}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-display tabular-nums text-text">
                      {formatMoney(r.billedAmountCents)}
                    </p>
                    <Badge
                      tone={STATUS_TONE[r.status] ?? "neutral"}
                      className="text-[9px] mt-1"
                    >
                      {statusLabel(r.status)}
                    </Badge>
                  </div>
                </div>
                {r.cptCodes.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.cptCodes.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                <p className="text-xs text-text-muted mt-1.5 leading-snug">
                  {r.reason}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// EMR-952 — Prior Authorization hub
// ---------------------------------------------------------------------------
// A fully editable PA form with an engine/plug-in selector sourced from the
// adapter registry. The packet is assembled + validated using the pure
// prior-auth library (assemblePriorAuthPacket / validateForSubmission); the
// actual submission is simulated (toast) — no external service is called.

const FIELD_CLASS =
  "h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text " +
  "transition-colors duration-200 focus:outline-none " +
  "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30";

const TEXTAREA_CLASS =
  "w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text " +
  "transition-colors duration-200 focus:outline-none " +
  "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30";

function PaField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-text-muted mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] text-text-subtle mt-1">{hint}</span>}
    </label>
  );
}

interface PaFormState {
  sourceClaimId: string; // "" = blank packet
  engineId: string;
  patientFirstName: string;
  patientLastName: string;
  dateOfBirth: string; // YYYY-MM-DD
  payerName: string;
  payerId: string;
  serviceOrDrug: string; // CPT / HCPCS / drug — free text, parsed on submit
  diagnosis: string; // ICD-10 — comma/space separated
  unitsRequested: string;
  presentingConcerns: string;
  treatmentGoals: string;
  clinicalJustification: string;
  severityInstrument: string;
  severityScore: string;
  priorTreatment: string;
  priorTreatmentMonths: string;
  priorTreatmentOutcome: string;
  providerName: string;
  providerNpi: string;
  notes: string;
}

function splitCodes(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function blankPaForm(engineId: string): PaFormState {
  return {
    sourceClaimId: "",
    engineId,
    patientFirstName: "",
    patientLastName: "",
    dateOfBirth: "",
    payerName: "",
    payerId: "",
    serviceOrDrug: "",
    diagnosis: "",
    unitsRequested: "1",
    presentingConcerns: "",
    treatmentGoals: "",
    clinicalJustification: "",
    severityInstrument: "PHQ-9",
    severityScore: "",
    priorTreatment: "",
    priorTreatmentMonths: "",
    priorTreatmentOutcome: "",
    providerName: "",
    providerNpi: "",
    notes: "",
  };
}

function PriorAuthModal({
  open,
  onClose,
  engines,
  claims,
}: {
  open: boolean;
  onClose: () => void;
  engines: PaEngineOption[];
  claims: SerializedScrubClaim[];
}) {
  const { toast } = useToast();
  const defaultEngine = engines[0]?.id ?? "";
  const [form, setForm] = useState<PaFormState>(() => blankPaForm(defaultEngine));
  const [errors, setErrors] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);

  function update<K extends keyof PaFormState>(key: K, value: PaFormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }

  // Prefill the form from an existing scrub-queue claim.
  function prefillFromClaim(claimId: string) {
    if (!claimId) {
      setForm((prev) => ({ ...blankPaForm(prev.engineId), engineId: prev.engineId }));
      setErrors([]);
      return;
    }
    const c = claims.find((x) => x.id === claimId);
    if (!c) return;
    setForm((prev) => ({
      ...blankPaForm(prev.engineId),
      sourceClaimId: claimId,
      engineId: prev.engineId,
      patientFirstName: c.patient.firstName,
      patientLastName: c.patient.lastName,
      payerName: c.payerName ?? "",
      serviceOrDrug: c.cptCodes.map((x) => x.code).join(", "),
      diagnosis: c.icd10Codes.map((x) => x.code).join(", "),
    }));
    setErrors([]);
    setDirty(true);
  }

  function buildPacket() {
    const dob = form.dateOfBirth ? new Date(form.dateOfBirth) : new Date(NaN);
    const severityScores =
      form.severityScore.trim() && !Number.isNaN(Number(form.severityScore))
        ? [
            {
              instrument: form.severityInstrument,
              score: Number(form.severityScore),
              cutoff: null,
            },
          ]
        : [];
    const priorTreatments = form.priorTreatment.trim()
      ? [
          {
            name: form.priorTreatment,
            durationMonths: Number(form.priorTreatmentMonths) || 0,
            outcome: form.priorTreatmentOutcome || "unknown",
          },
        ]
      : [];
    // Fold the free-text clinical justification into the reviewer notes.
    const notes = [form.clinicalJustification, form.notes]
      .map((s) => s.trim())
      .filter(Boolean)
      .join("\n\n");

    return assemblePriorAuthPacket({
      patient: {
        firstName: form.patientFirstName,
        lastName: form.patientLastName,
        dateOfBirth: dob,
        presentingConcerns: form.presentingConcerns || null,
        treatmentGoals: form.treatmentGoals || null,
        contraindications: [],
      },
      payerName: form.payerName,
      payerId: form.payerId || null,
      cptCodes: splitCodes(form.serviceOrDrug),
      icd10Codes: splitCodes(form.diagnosis),
      unitsRequested: Number(form.unitsRequested) || 1,
      severityScores,
      priorTreatments,
      providerAttestation: {
        providerName: form.providerName,
        npi: form.providerNpi || null,
        signedAt: new Date(),
      },
      supportingDocIds: [],
      notes,
    });
  }

  function handleSubmit() {
    let packet;
    try {
      packet = buildPacket();
    } catch {
      setErrors(["Could not assemble the packet — check the date of birth."]);
      return;
    }
    const result = validateForSubmission(packet);
    if (!result.ok) {
      setErrors(result.errors);
      toast({
        title: "Prior auth not ready",
        description: `${result.errors.length} field${result.errors.length !== 1 ? "s" : ""} need attention before submission.`,
        variant: "warning",
      });
      return;
    }
    setErrors([]);
    const engine = engines.find((e) => e.id === form.engineId);
    // Simulated submission — no external portal is contacted (EMR-952).
    const ref = `PA-${(engine?.id ?? "engine").toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
    toast({
      title: "Prior auth submitted",
      description: `${packet.patient.name} · ${engine?.displayName ?? "engine"} · ref ${ref} (simulated)`,
      variant: "success",
    });
    setForm(blankPaForm(form.engineId));
    setDirty(false);
    onClose();
  }

  function handleClose() {
    setErrors([]);
    setDirty(false);
    setForm(blankPaForm(defaultEngine));
    onClose();
  }

  const selectedEngine = engines.find((e) => e.id === form.engineId);

  return (
    <ModalShell
      open={open}
      onClose={handleClose}
      isDirty={dirty}
      placement="center"
      maxWidth="max-w-2xl"
      eyebrow="Scrub and Auths"
      title="Prior Authorization"
      description="Assemble and submit a prior-auth packet. Pick the payer's engine/plug-in below — submission is simulated."
      footer={
        <div className="flex items-center justify-between gap-3 px-6 py-4">
          <p className="text-[11px] text-text-subtle">
            {selectedEngine
              ? `Routing via ${selectedEngine.displayName}`
              : "Select an engine to route this packet"}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="text-xs font-semibold px-3 py-2 rounded-md text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-md bg-accent text-accent-ink shadow-sm hover:bg-accent/90 transition-colors"
            >
              <FileCheck2 className="w-3.5 h-3.5" aria-hidden="true" />
              Submit prior auth
            </button>
          </div>
        </div>
      }
    >
      <div className="px-6 py-5 space-y-5">
        {/* Engine selector + prefill source */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <PaField
            label="Engine / plug-in"
            hint={
              selectedEngine && selectedEngine.supportedPayers.length > 0
                ? `Best for: ${selectedEngine.supportedPayers.join(", ")}`
                : "Universal fallback"
            }
          >
            <select
              value={form.engineId}
              onChange={(e) => update("engineId", e.target.value)}
              className={FIELD_CLASS}
            >
              {engines.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.displayName}
                </option>
              ))}
            </select>
          </PaField>
          <PaField label="Prefill from a queued claim" hint="Optional — autofills patient, payer, codes.">
            <select
              value={form.sourceClaimId}
              onChange={(e) => prefillFromClaim(e.target.value)}
              className={FIELD_CLASS}
            >
              <option value="">Blank packet</option>
              {claims.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.patient.firstName} {c.patient.lastName} ·{" "}
                  {c.claimNumber ?? "No CLM #"}
                </option>
              ))}
            </select>
          </PaField>
        </div>

        {/* Validation summary */}
        {errors.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-xs font-semibold text-amber-900 mb-1">
              Resolve these before submitting:
            </p>
            <ul className="list-disc pl-4 space-y-0.5">
              {errors.map((e) => (
                <li key={e} className="text-[11px] text-amber-800">
                  {e}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Patient */}
        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-text-subtle">
            Patient
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PaField label="First name">
              <input
                value={form.patientFirstName}
                onChange={(e) => update("patientFirstName", e.target.value)}
                className={FIELD_CLASS}
              />
            </PaField>
            <PaField label="Last name">
              <input
                value={form.patientLastName}
                onChange={(e) => update("patientLastName", e.target.value)}
                className={FIELD_CLASS}
              />
            </PaField>
            <PaField label="Date of birth">
              <input
                type="date"
                value={form.dateOfBirth}
                onChange={(e) => update("dateOfBirth", e.target.value)}
                className={FIELD_CLASS}
              />
            </PaField>
          </div>
        </fieldset>

        {/* Payer + request */}
        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-text-subtle">
            Payer &amp; request
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PaField label="Payer name">
              <input
                value={form.payerName}
                onChange={(e) => update("payerName", e.target.value)}
                className={FIELD_CLASS}
                placeholder="e.g. Aetna"
              />
            </PaField>
            <PaField label="Payer ID" hint="Optional — payer-assigned identifier.">
              <input
                value={form.payerId}
                onChange={(e) => update("payerId", e.target.value)}
                className={FIELD_CLASS}
              />
            </PaField>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PaField label="Drug / service" hint="CPT, HCPCS, or NDC — space or comma separated.">
              <input
                value={form.serviceOrDrug}
                onChange={(e) => update("serviceOrDrug", e.target.value)}
                className={FIELD_CLASS}
                placeholder="99214, J0000"
              />
            </PaField>
            <PaField label="Diagnosis" hint="ICD-10 — space or comma separated.">
              <input
                value={form.diagnosis}
                onChange={(e) => update("diagnosis", e.target.value)}
                className={FIELD_CLASS}
                placeholder="G89.29, F41.1"
              />
            </PaField>
            <PaField label="Units requested">
              <input
                type="number"
                min={1}
                value={form.unitsRequested}
                onChange={(e) => update("unitsRequested", e.target.value)}
                className={FIELD_CLASS}
              />
            </PaField>
          </div>
        </fieldset>

        {/* Clinical */}
        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-text-subtle">
            Clinical
          </legend>
          <PaField label="Presenting concerns">
            <textarea
              rows={2}
              value={form.presentingConcerns}
              onChange={(e) => update("presentingConcerns", e.target.value)}
              className={TEXTAREA_CLASS}
            />
          </PaField>
          <PaField label="Treatment goals">
            <textarea
              rows={2}
              value={form.treatmentGoals}
              onChange={(e) => update("treatmentGoals", e.target.value)}
              className={TEXTAREA_CLASS}
            />
          </PaField>
          <PaField
            label="Clinical justification"
            hint="Medical-necessity narrative — included with the packet notes."
          >
            <textarea
              rows={3}
              value={form.clinicalJustification}
              onChange={(e) => update("clinicalJustification", e.target.value)}
              className={TEXTAREA_CLASS}
            />
          </PaField>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PaField label="Severity instrument">
              <select
                value={form.severityInstrument}
                onChange={(e) => update("severityInstrument", e.target.value)}
                className={FIELD_CLASS}
              >
                {["PHQ-9", "GAD-7", "ESAS", "PCL-5", "ISI"].map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </PaField>
            <PaField label="Severity score" hint="Required by most payers.">
              <input
                type="number"
                value={form.severityScore}
                onChange={(e) => update("severityScore", e.target.value)}
                className={FIELD_CLASS}
              />
            </PaField>
            <div />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <PaField label="Prior treatment tried">
              <input
                value={form.priorTreatment}
                onChange={(e) => update("priorTreatment", e.target.value)}
                className={FIELD_CLASS}
                placeholder="e.g. Gabapentin"
              />
            </PaField>
            <PaField label="Duration (months)">
              <input
                type="number"
                min={0}
                value={form.priorTreatmentMonths}
                onChange={(e) => update("priorTreatmentMonths", e.target.value)}
                className={FIELD_CLASS}
              />
            </PaField>
            <PaField label="Outcome">
              <input
                value={form.priorTreatmentOutcome}
                onChange={(e) => update("priorTreatmentOutcome", e.target.value)}
                className={FIELD_CLASS}
                placeholder="e.g. inadequate relief"
              />
            </PaField>
          </div>
        </fieldset>

        {/* Attestation */}
        <fieldset className="space-y-3">
          <legend className="text-[11px] font-bold uppercase tracking-wider text-text-subtle">
            Provider attestation
          </legend>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <PaField label="Provider name">
              <input
                value={form.providerName}
                onChange={(e) => update("providerName", e.target.value)}
                className={FIELD_CLASS}
              />
            </PaField>
            <PaField label="NPI" hint="Optional.">
              <input
                value={form.providerNpi}
                onChange={(e) => update("providerNpi", e.target.value)}
                className={FIELD_CLASS}
              />
            </PaField>
          </div>
          <PaField label="Reviewer notes" hint="Free text — last resort.">
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              className={TEXTAREA_CLASS}
            />
          </PaField>
        </fieldset>
      </div>
    </ModalShell>
  );
}
