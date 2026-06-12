"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ModalShell } from "@/components/ui/modal-shell";

// ---------------------------------------------------------------------------
// Encounter Financial Timeline (Dr. Patel directive — billing).
// The server pre-formats every money/date string so this client component
// never imports the billing/prisma layer (mirrors EventLog / StatementHistory).
// Adds: sortable column headers, a History toggle for resolved/closed claims,
// and a click-to-open claim-detail popup with the full lifecycle trail.
// ---------------------------------------------------------------------------

type Tone = "success" | "danger" | "accent" | "warning";

export interface ClaimDetail {
  claimNumber: string;
  payerName: string | null;
  serviceDateLabel: string;
  statusLabel: string;
  statusTone: Tone;
  cpts: { code: string; label: string }[];
  /** Money breakdown rows (charge, insurance, adjustment, patient resp, paid, balance). */
  money: { label: string; value: string; tone?: "muted" | "success" | "warning" }[];
  payments: {
    sourceLabel: string;
    dateLabel: string;
    amountLabel: string;
    reference: string | null;
  }[];
  /** Lifecycle trail: submission → processing → reimbursed → closed. */
  history: { label: string; dateLabel: string | null; done: boolean }[];
  denialReason: string | null;
}

export interface TimelineRow {
  id: string;
  claimNumber: string;
  serviceDateLabel: string;
  serviceTs: number;
  cpts: { code: string; label: string }[];
  billedLabel: string;
  billedCents: number;
  insuranceLabel: string;
  insuranceCents: number;
  adjustmentLabel: string;
  adjustmentCents: number;
  patientLabel: string;
  patientCents: number;
  balanceLabel: string;
  balanceCents: number;
  status: string;
  statusTone: Tone;
  /** Resolved/closed claims are hidden until the History toggle is on. */
  isClosed: boolean;
  detail: ClaimDetail;
}

type SortKey =
  | "serviceTs"
  | "billedCents"
  | "insuranceCents"
  | "adjustmentCents"
  | "patientCents"
  | "balanceCents"
  | "status";

const COLUMNS: {
  key: SortKey;
  label: string;
  align: "left" | "right";
  numeric: boolean;
}[] = [
  { key: "serviceTs", label: "Date", align: "left", numeric: true },
  { key: "billedCents", label: "Charge", align: "right", numeric: true },
  { key: "insuranceCents", label: "Insurance", align: "right", numeric: true },
  { key: "adjustmentCents", label: "Adjustment", align: "right", numeric: true },
  { key: "patientCents", label: "Patient", align: "right", numeric: true },
  { key: "balanceCents", label: "Balance", align: "right", numeric: true },
  { key: "status", label: "Status", align: "left", numeric: false },
];

export function FinancialTimeline({ rows }: { rows: TimelineRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "serviceTs",
    dir: "desc",
  });
  const [showResolved, setShowResolved] = useState(false);
  const [selected, setSelected] = useState<ClaimDetail | null>(null);

  const closedCount = useMemo(
    () => rows.filter((r) => r.isClosed).length,
    [rows],
  );

  const visible = useMemo(() => {
    const filtered = showResolved ? rows : rows.filter((r) => !r.isClosed);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sort.key === "status") {
        return a.status.localeCompare(b.status) * dir;
      }
      return ((a[sort.key] as number) - (b[sort.key] as number)) * dir;
    });
  }, [rows, showResolved, sort]);

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "status" ? "asc" : "desc" },
    );
  }

  return (
    <>
      <Card tone="raised">
        <CardContent className="p-0">
          {/* History toggle — reveals resolved/closed claims (Patel directive). */}
          {closedCount > 0 && (
            <div className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-border/60">
              <span className="text-[10px] uppercase tracking-wider text-text-subtle">
                {showResolved
                  ? `Showing all ${rows.length} claims`
                  : `${rows.length - closedCount} active`}
              </span>
              <button
                type="button"
                onClick={() => setShowResolved((v) => !v)}
                aria-pressed={showResolved}
                className="text-xs font-medium text-accent hover:text-accent-strong transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
              >
                {showResolved
                  ? "Hide resolved"
                  : `History · ${closedCount} resolved`}
              </button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {COLUMNS.map((col) => {
                    const active = sort.key === col.key;
                    return (
                      <th
                        key={col.key}
                        className={`py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider ${
                          col.align === "right" ? "text-right" : ""
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSort(col.key)}
                          className={`inline-flex items-center gap-1 hover:text-text transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded ${
                            col.align === "right" ? "flex-row-reverse" : ""
                          } ${active ? "text-text" : ""}`}
                          aria-label={`Sort by ${col.label}`}
                        >
                          {col.label}
                          <SortCaret active={active} dir={sort.dir} />
                        </button>
                      </th>
                    );
                  })}
                  {/* Service column — non-sortable, holds CPT chips */}
                  <th className="py-3 px-5 font-medium text-text-subtle text-[10px] uppercase tracking-wider">
                    Service
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {visible.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelected(row.detail)}
                    className="hover:bg-surface-muted/40 cursor-pointer"
                    tabIndex={0}
                    role="button"
                    aria-label={`Open claim ${row.claimNumber} detail`}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelected(row.detail);
                      }
                    }}
                  >
                    <td className="py-3 px-5 text-text-muted tabular-nums text-xs">
                      {row.serviceDateLabel}
                    </td>
                    <td className="py-3 px-5 text-right tabular-nums text-text">
                      {row.billedLabel}
                    </td>
                    <td className="py-3 px-5 text-right tabular-nums text-success">
                      {row.insuranceLabel}
                    </td>
                    <td className="py-3 px-5 text-right tabular-nums text-text-muted">
                      {row.adjustmentLabel}
                    </td>
                    <td className="py-3 px-5 text-right tabular-nums">
                      {row.patientLabel}
                    </td>
                    <td className="py-3 px-5 text-right tabular-nums font-medium">
                      <span
                        className={
                          row.balanceCents > 0
                            ? "text-[color:var(--warning)]"
                            : "text-text-subtle"
                        }
                      >
                        {row.balanceLabel}
                      </span>
                    </td>
                    <td className="py-3 px-5">
                      <Badge tone={row.statusTone} className="text-[10px]">
                        {row.status}
                      </Badge>
                    </td>
                    <td className="py-3 px-5">
                      <div className="flex flex-wrap gap-1">
                        {row.cpts.map((c) => (
                          <span
                            key={c.code}
                            className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent"
                            title={c.label}
                          >
                            {c.code}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ClaimDetailModal claim={selected} onClose={() => setSelected(null)} />
    </>
  );
}

function SortCaret({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  return (
    <svg
      width="9"
      height="9"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden="true"
      className={active ? "text-accent" : "text-text-subtle/50"}
    >
      <path
        d="M5 2.5L7.5 5.5H2.5L5 2.5Z"
        fill="currentColor"
        opacity={active && dir === "asc" ? 1 : 0.35}
      />
      <path
        d="M5 7.5L2.5 4.5H7.5L5 7.5Z"
        fill="currentColor"
        opacity={active && dir === "desc" ? 1 : 0.35}
      />
    </svg>
  );
}

function ClaimDetailModal({
  claim,
  onClose,
}: {
  claim: ClaimDetail | null;
  onClose: () => void;
}) {
  return (
    <ModalShell
      open={claim !== null}
      onClose={onClose}
      placement="center"
      maxWidth="max-w-xl"
      eyebrow="Claim detail"
      title={claim ? claim.claimNumber : ""}
      description={
        claim
          ? `${claim.payerName ?? "Self-pay"} · service ${claim.serviceDateLabel}`
          : undefined
      }
    >
      {claim && (
        <div className="px-6 py-5 space-y-6">
          {/* Status + CPTs */}
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={claim.statusTone}>{claim.statusLabel}</Badge>
            {claim.cpts.map((c) => (
              <span
                key={c.code}
                className="inline-block px-1.5 py-0.5 rounded text-[10px] font-mono bg-accent/10 text-accent"
                title={c.label}
              >
                {c.code}
              </span>
            ))}
          </div>

          {/* Money breakdown */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-2">
              Financial breakdown
            </p>
            <dl className="divide-y divide-border/50 rounded-lg border border-border/60">
              {claim.money.map((m) => (
                <div
                  key={m.label}
                  className="flex items-center justify-between px-4 py-2.5"
                >
                  <dt className="text-sm text-text-muted">{m.label}</dt>
                  <dd
                    className={`text-sm tabular-nums font-medium ${
                      m.tone === "success"
                        ? "text-success"
                        : m.tone === "warning"
                          ? "text-[color:var(--warning)]"
                          : m.tone === "muted"
                            ? "text-text-subtle"
                            : "text-text"
                    }`}
                  >
                    {m.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Lifecycle trail */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-3">
              Claim history
            </p>
            <ol className="space-y-3">
              {claim.history.map((step, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 shrink-0 h-5 w-5 rounded-full flex items-center justify-center ${
                      step.done
                        ? "bg-success/15 text-success"
                        : "bg-surface-muted text-text-subtle"
                    }`}
                    aria-hidden
                  >
                    {step.done ? (
                      <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3.5 7L6 9.5L10.5 4.5"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p
                      className={`text-sm ${step.done ? "text-text" : "text-text-subtle"}`}
                    >
                      {step.label}
                    </p>
                    {step.dateLabel && (
                      <p className="text-xs text-text-subtle tabular-nums">
                        {step.dateLabel}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
            {claim.denialReason && (
              <p className="mt-3 text-xs text-danger bg-danger/5 border border-danger/15 rounded-lg px-3 py-2">
                Denial reason: {claim.denialReason}
              </p>
            )}
          </div>

          {/* Payments */}
          {claim.payments.length > 0 && (
            <div>
              <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-2">
                Payments posted
              </p>
              <ul className="space-y-2">
                {claim.payments.map((p, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="min-w-0">
                      <span className="text-text">{p.sourceLabel}</span>
                      <span className="text-text-subtle">
                        {" "}
                        · {p.dateLabel}
                        {p.reference ? ` · ${p.reference}` : ""}
                      </span>
                    </div>
                    <span className="tabular-nums text-success font-medium">
                      {p.amountLabel}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
}
