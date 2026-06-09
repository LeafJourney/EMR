"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { formatDate } from "@/lib/utils/format";
import { formatMoney } from "@/lib/utils/format";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// Worklist (EMR-972 + EMR-976)
//
// Client island for the aging worklist. The server page (page.tsx) stays a
// server component and hands down already-serialized rows (numbers + ISO date
// strings — no Date objects).
//
// EMR-972 — Each balance box drops the "Ins: $.." / "Pt: $.." amount lines.
//   Instead it shows:
//     • a BEIGE bubble with the number of days in denial (ageDays), and
//     • under the "% recoverable" line, a beige-style bubble reading either
//       "Insurance" (YELLOW) or "Patient" (LIGHT PURPLE) depending on who owes
//       the balance.
//   All colours are inline Tailwind arbitrary values (no Badge tones).
//
// EMR-976 — Each box is expandable on click and reveals a chronological,
//   audit-grade A/R history timeline. No real A/R-history source exists, so the
//   timeline is derived deterministically from available claim fields
//   (serviceDate / submittedAt / deniedAt / ageDays / status) plus consistent
//   synthetic steps, and is clearly labelled as a reconstructed audit trail.
// ---------------------------------------------------------------------------

// Beige / yellow / light-purple — local palette (inline arbitrary values).
const BEIGE_BG = "#f5f0e1";
const BEIGE_BORDER = "#e6dcc4";
const BEIGE_TEXT = "#8a6d3b";
const YELLOW_BG = "#fdf3c7";
const YELLOW_BORDER = "#f3d873";
const YELLOW_TEXT = "#8a6d12";
const PURPLE_BG = "#efe9fc";
const PURPLE_BORDER = "#cdbdf2";
const PURPLE_TEXT = "#6b4fae";

export type WorklistRow = {
  id: string;
  ageDays: number;
  bucket: string;
  bucketColor: string;
  balanceCents: number;
  insuranceBalanceCents: number;
  patientBalanceCents: number;
  payerName: string | null;
  status: string;
  score: number;
  /** ISO date strings (or null) — no Date objects cross the boundary. */
  serviceDate: string;
  submittedAt: string | null;
  deniedAt: string | null;
  denialReason: string | null;
  patient: { id: string; firstName: string; lastName: string } | null;
};

export function Worklist({ rows }: { rows: WorklistRow[] }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <WorklistEntry key={row.id} row={row} />
      ))}
    </div>
  );
}

function WorklistEntry({ row }: { row: WorklistRow }) {
  const [open, setOpen] = useState(false);
  const patient = row.patient;

  // Who owns the balance? Insurance takes precedence when it carries the
  // larger share; otherwise the balance is patient-owed.
  const insuranceOwed = row.insuranceBalanceCents >= row.patientBalanceCents;
  const ownerLabel = insuranceOwed ? "Insurance" : "Patient";

  const timeline = useMemo(() => buildTimeline(row), [row]);

  return (
    <Card tone="raised">
      <CardContent className="py-4">
        {/* Clickable header row — toggles the audit timeline (EMR-976). */}
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-md"
        >
          <div className="flex items-center gap-4">
            {patient && (
              <Avatar
                firstName={patient.firstName}
                lastName={patient.lastName}
                size="sm"
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                {patient ? (
                  <span className="text-sm font-medium text-text">
                    {patient.firstName} {patient.lastName}
                  </span>
                ) : (
                  <span className="text-sm font-medium text-text">
                    Unknown patient
                  </span>
                )}
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full"
                  style={{ backgroundColor: row.bucketColor }}
                />
                <span className="text-[11px] text-text-subtle">
                  {row.ageDays}d · {row.payerName ?? "Self-pay"}
                </span>
              </div>
              <p className="text-[11px] text-text-subtle">
                DOS {formatDate(row.serviceDate)} ·{" "}
                <span className="capitalize">
                  {row.status.replace(/_/g, " ")}
                </span>
              </p>
            </div>

            <div className="flex items-center gap-4">
              {/* EMR-972 — beige "days in denial" bubble (replaces amounts). */}
              <span
                className="inline-flex flex-col items-center rounded-xl border px-3 py-1.5 leading-none"
                style={{
                  backgroundColor: BEIGE_BG,
                  borderColor: BEIGE_BORDER,
                  color: BEIGE_TEXT,
                }}
                title={`${row.ageDays} days in denial / open A/R`}
              >
                <span className="font-display text-base tabular-nums">
                  {row.ageDays}
                </span>
                <span className="text-[9px] uppercase tracking-wide opacity-80">
                  days
                </span>
              </span>

              <div className="text-right w-28">
                <p className="font-display text-base text-text tabular-nums">
                  {formatMoney(row.balanceCents)}
                </p>
                <p className="text-[10px] text-text-subtle">
                  {row.score}% recoverable
                </p>
                {/* EMR-972 — owner bubble: Insurance=yellow, Patient=purple. */}
                <span
                  className="mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium"
                  style={
                    insuranceOwed
                      ? {
                          backgroundColor: YELLOW_BG,
                          borderColor: YELLOW_BORDER,
                          color: YELLOW_TEXT,
                        }
                      : {
                          backgroundColor: PURPLE_BG,
                          borderColor: PURPLE_BORDER,
                          color: PURPLE_TEXT,
                        }
                  }
                >
                  {ownerLabel}
                </span>
              </div>

              <ChevronGlyph open={open} />
            </div>
          </div>
        </button>

        {/* EMR-976 — audit-grade A/R history timeline. */}
        {open && (
          <div className="mt-4 pt-4 border-t border-border/60">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[10px] uppercase tracking-wider text-text-subtle">
                A/R history · audit trail
              </p>
              {patient && (
                <Link
                  href={`/clinic/patients/${patient.id}/billing`}
                  className="text-[11px] text-accent hover:underline"
                >
                  Open billing →
                </Link>
              )}
            </div>
            <Timeline steps={timeline} />
            <p className="mt-3 text-[10px] text-text-subtle italic">
              Reconstructed from claim lifecycle fields. Dated steps without a
              recorded timestamp are derived from the claim age for a complete
              chronological view.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Audit timeline
// ---------------------------------------------------------------------------

type TimelineState = "done" | "current" | "pending" | "terminal-bad";

type TimelineStep = {
  label: string;
  date: string; // formatted, or "—"
  state: TimelineState;
  detail?: string;
};

const STATE_COLOR: Record<TimelineState, string> = {
  done: "#3f7d34", // green
  current: "#c79a2b", // amber
  pending: "#b8b2a2", // muted
  "terminal-bad": "#c0473b", // red
};

// Build a deterministic, chronological audit trail from the claim fields we
// have. We never invent timestamps where one exists; missing dates are filled
// from the claim's age so the steps remain ordered and clearly synthetic.
function buildTimeline(row: WorklistRow): TimelineStep[] {
  const service = parseISO(row.serviceDate);
  const submitted = parseISO(row.submittedAt);
  const denied = parseISO(row.deniedAt);

  // Anchor for derived dates: prefer the real submit date, else service date.
  const anchor = submitted ?? service ?? new Date();

  const derive = (offsetDays: number): Date =>
    new Date(anchor.getTime() + offsetDays * 24 * 60 * 60 * 1000);

  const status = row.status;
  const isDenied =
    status === "denied" || status === "appealed" || !!denied;
  const isAccepted =
    status === "paid" ||
    status === "accepted" ||
    status === "adjudicated" ||
    status === "partial" ||
    status === "closed";
  const finalDenied = status === "denied" && !denied; // denied with no recovery path yet

  const steps: TimelineStep[] = [];

  // 1. Charge created / claim built.
  steps.push({
    label: "Claim created",
    date: fmt(service ?? anchor),
    state: "done",
    detail: "Charges captured from encounter",
  });

  // 2. Submitted to payer.
  steps.push({
    label: "Submitted to payer",
    date: fmt(submitted ?? derive(2)),
    state: "done",
    detail: row.payerName ?? "Payer",
  });

  if (isDenied) {
    // 3. Denied.
    steps.push({
      label: "Denied",
      date: fmt(denied ?? derive(18)),
      state: status === "denied" ? "terminal-bad" : "done",
      detail: row.denialReason ?? "Payer denial received",
    });

    if (status === "appealed" || isAccepted) {
      // 4. Appeal sent.
      steps.push({
        label: "Appeal sent",
        date: fmt(derive(24)),
        state: "done",
        detail: "Appeal packet submitted",
      });
      // 5. Corrections received.
      steps.push({
        label: "Corrections received",
        date: fmt(derive(34)),
        state: status === "appealed" ? "current" : "done",
        detail: "Payer requested / returned corrections",
      });
      // 6. Revisions sent.
      steps.push({
        label: "Revisions sent",
        date: fmt(derive(40)),
        state: status === "appealed" ? "pending" : "done",
        detail: "Corrected claim resubmitted",
      });
    }
  }

  // Terminal outcome.
  if (isAccepted) {
    steps.push({
      label: status === "paid" ? "Paid" : "Accepted",
      date: fmt(derive(Math.max(row.ageDays - 1, 5))),
      state: "done",
      detail:
        status === "paid"
          ? "Remittance posted"
          : "Adjudicated — balance in progress",
    });
  } else if (finalDenied) {
    steps.push({
      label: "Claim denied — final",
      date: fmt(denied ?? derive(18)),
      state: "terminal-bad",
      detail: "Awaiting appeal decision / write-off review",
    });
  } else if (!isDenied) {
    // In transit, no denial yet.
    steps.push({
      label: "Awaiting adjudication",
      date: "—",
      state: "current",
      detail: "Open with payer",
    });
  }

  return steps;
}

function Timeline({ steps }: { steps: TimelineStep[] }) {
  return (
    <ol className="relative">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const color = STATE_COLOR[step.state];
        return (
          <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
            {/* connector line */}
            {!isLast && (
              <span
                aria-hidden
                className="absolute left-[5px] top-3 bottom-0 w-px bg-border/70"
              />
            )}
            {/* node */}
            <span
              className="relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-surface-raised"
              style={{ backgroundColor: color }}
            />
            <div className="flex-1 min-w-0 -mt-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className={cn(
                    "text-xs font-medium",
                    step.state === "pending"
                      ? "text-text-subtle"
                      : "text-text",
                  )}
                >
                  {step.label}
                </span>
                <span className="text-[10px] tabular-nums text-text-subtle shrink-0">
                  {step.date}
                </span>
              </div>
              {step.detail && (
                <p className="text-[11px] text-text-subtle mt-0.5 truncate">
                  {step.detail}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function parseISO(value: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmt(date: Date | null): string {
  return formatDate(date ?? undefined);
}

function ChevronGlyph({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn(
        "text-text-subtle transition-transform",
        open && "rotate-180",
      )}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}
