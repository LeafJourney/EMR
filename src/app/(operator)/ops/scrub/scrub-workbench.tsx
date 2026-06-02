"use client";

/**
 * EMR-968 + EMR-975 — interactive shell for the Claim Scrub Workbench.
 *
 * EMR-968: the top stat tiles are clickable. Selecting a tile smooth-scrolls
 *          down to the "Claims requiring review" list, filters that list to
 *          the tile's bucket, and re-titles the section header to match.
 * EMR-975: a filter button to the right of the section title opens a popup
 *          (ModalShell) for searching historical / chronological claims data
 *          across every bucket (patient, claim #, CPT, payer + status filter).
 */

import * as React from "react";
import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Filter, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/ornament";
import { StatCard } from "@/components/ui/stat-card";
import { ModalShell } from "@/components/ui/modal-shell";
import { Input } from "@/components/ui/input";
import { formatDate, formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";
import type { ScrubIssue, ScrubSeverity } from "@/lib/billing/scrub";

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

interface ScrubWorkbenchProps {
  scrubbed: SerializedScrubClaim[];
  historical: HistoricalClaim[];
  tiles: TileStat[];
  /** Title to show on the lower section when no tile is selected. */
  defaultSectionTitle: string;
  /** Server-rendered content slotted between the tiles and the list. */
  children?: React.ReactNode;
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

export function ScrubWorkbench({
  scrubbed,
  historical,
  tiles,
  defaultSectionTitle,
  children,
}: ScrubWorkbenchProps) {
  const [selected, setSelected] = useState<TileKey | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  function handleTileClick(key: TileKey) {
    setSelected((prev) => (prev === key ? null : key));
    // Defer scroll until after the filter state has rendered.
    requestAnimationFrame(() => {
      listRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const filtered = useMemo(
    () =>
      selected ? scrubbed.filter((c) => tileMatches(selected, c)) : scrubbed,
    [selected, scrubbed],
  );

  const sectionTitle = selected
    ? TILE_SECTION_TITLE[selected]
    : defaultSectionTitle;

  return (
    <>
      {/* Top stats — clickable (EMR-968) */}
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
              <StatCard
                label={tile.label}
                value={tile.value}
                tone={tile.tone}
                hint={tile.hint}
              />
            </button>
          );
        })}
      </div>

      {/* Server-rendered slot (e.g. "Top issues this week") */}
      {children}

      {/* Section header + filter affordance (EMR-975) */}
      <div ref={listRef} className="scroll-mt-6 mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Eyebrow>{sectionTitle}</Eyebrow>
          {selected && (
            <button
              type="button"
              onClick={() => setSelected(null)}
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
          description="Nothing matches this tile right now. Clear the filter to see the full queue."
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((claim) => (
            <ClaimRow key={claim.id} claim={claim} />
          ))}
        </div>
      )}

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        historical={historical}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Claim card — preserves the original server markup verbatim.
// ---------------------------------------------------------------------------

function ClaimRow({ claim }: { claim: SerializedScrubClaim }) {
  const { issues, counts, submittable } = claim;
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
                className="text-sm font-medium text-text hover:text-accent transition-colors"
              >
                {claim.patient.firstName} {claim.patient.lastName}
              </Link>
              <p className="text-[11px] text-text-subtle">
                {formatDate(claim.serviceDateIso)} ·{" "}
                {claim.payerName ?? "No payer"} · {claim.claimNumber}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-xl text-text tabular-nums">
              {formatMoney(claim.billedAmountCents)}
            </p>
            <div className="flex items-center gap-1 mt-1">
              {counts.error > 0 && (
                <Badge tone="danger" className="text-[9px]">
                  {counts.error} error
                  {counts.error !== 1 ? "s" : ""}
                </Badge>
              )}
              {counts.warning > 0 && (
                <Badge tone="warning" className="text-[9px]">
                  {counts.warning} warning
                  {counts.warning !== 1 ? "s" : ""}
                </Badge>
              )}
              {counts.info > 0 && (
                <Badge tone="info" className="text-[9px]">
                  {counts.info} info
                </Badge>
              )}
              {issues.length === 0 && (
                <Badge tone="success" className="text-[9px]">
                  Clean
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* CPT + ICD codes */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {claim.cptCodes.map((c) => (
            <span
              key={c.code}
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent"
            >
              {c.code}
            </span>
          ))}
          {claim.icd10Codes.map((c) => (
            <span
              key={c.code}
              className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono bg-highlight/10 text-[color:var(--highlight)]"
            >
              {c.code}
            </span>
          ))}
        </div>

        {/* Issues */}
        {issues.length > 0 && (
          <div className="space-y-2 mb-4">
            {issues.map((issue, i) => (
              <IssueRow key={i} issue={issue} />
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/60">
          <Link
            href={`/clinic/patients/${claim.patient.id}/billing`}
            className="text-xs text-text-muted hover:text-text"
          >
            Open billing
          </Link>
          <button
            disabled={!submittable}
            className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
              submittable
                ? "bg-accent text-accent-ink hover:bg-accent/90"
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

function IssueRow({ issue }: { issue: ScrubIssue }) {
  return (
    <div
      className="flex items-start gap-3 p-3 rounded-lg bg-surface-muted/40"
      style={{
        borderLeft: `2px solid ${SEVERITY_COLORS[issue.severity]}`,
      }}
    >
      <div className="shrink-0 pt-0.5">
        <span
          className="inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold text-white"
          style={{ backgroundColor: SEVERITY_COLORS[issue.severity] }}
        >
          {issue.severity === "error" ? "!" : issue.severity === "warning" ? "?" : "i"}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[10px] font-mono text-text-subtle uppercase">
            {issue.ruleCode}
          </span>
          {issue.relatedCode && (
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent/10 text-accent">
              {issue.relatedCode}
            </span>
          )}
        </div>
        <p className="text-sm text-text leading-snug">{issue.message}</p>
        <p className="text-xs text-text-muted mt-1 leading-snug">
          → {issue.suggestion}
        </p>
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
