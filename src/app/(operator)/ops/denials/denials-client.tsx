"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/format";

// ---------------------------------------------------------------------------
// Serialized timeline entry (built server-side in page.tsx). `date` is an ISO
// string (or null for the denial anchor when deniedAt is missing).
// ---------------------------------------------------------------------------
export type TimelineEntry = {
  label: string;
  date: string | null;
  kind:
    | "denied"
    | "submission"
    | "appeal"
    | "insurer"
    | "revision"
    | "outcome"
    | "adjustment"
    | "resolved";
};

type UrgencyTone = "danger" | "warning" | "neutral";

// Dot color per event kind — keeps the audit trail scannable.
const KIND_DOT: Record<TimelineEntry["kind"], string> = {
  denied: "bg-danger",
  submission: "bg-accent",
  appeal: "bg-accent",
  insurer: "bg-amber-400",
  revision: "bg-accent",
  outcome: "bg-text-subtle",
  adjustment: "bg-text-subtle",
  resolved: "bg-success",
};

export function DenialCard({
  urgency,
  urgencyTone,
  patientId,
  patientFirstName,
  patientLastName,
  serviceDateLabel,
  payerName,
  claimNumber,
  deniedRelative,
  billedLabel,
  triageLabel,
  triageCategory,
  triageDescription,
  denialReason,
  suggestedActionLabel,
  timeline,
}: {
  urgency: string;
  urgencyTone: UrgencyTone;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  serviceDateLabel: string;
  payerName: string | null;
  claimNumber: string | null;
  deniedRelative: string | null;
  billedLabel: string;
  triageLabel: string;
  triageCategory: string;
  triageDescription: string;
  denialReason: string | null;
  suggestedActionLabel: string;
  timeline: TimelineEntry[];
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <Card
      tone="raised"
      className={
        urgency === "high"
          ? "border-l-4 border-l-danger"
          : "border-l-4 border-l-[color:var(--warning)]"
      }
    >
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex items-center gap-3">
            <Avatar
              firstName={patientFirstName}
              lastName={patientLastName}
              size="md"
            />
            <div>
              <Link
                href={`/clinic/patients/${patientId}/billing`}
                className="text-sm font-medium text-text hover:text-accent transition-colors"
              >
                {patientFirstName} {patientLastName}
              </Link>
              <p className="text-[11px] text-text-subtle">
                {serviceDateLabel} · {payerName} · {claimNumber}
              </p>
              {deniedRelative && (
                <div className="flex items-center gap-1.5">
                  <p className="text-[11px] text-text-subtle">
                    Denied {deniedRelative}
                  </p>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((o) => !o)}
                    aria-expanded={historyOpen}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors",
                      "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100",
                    )}
                  >
                    History
                    <svg
                      viewBox="0 0 12 12"
                      className={cn(
                        "h-2.5 w-2.5 transition-transform",
                        historyOpen && "rotate-180",
                      )}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      aria-hidden="true"
                    >
                      <path
                        d="M3 4.5 6 7.5 9 4.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="font-display text-xl text-text tabular-nums">
              {billedLabel}
            </p>
            <Badge tone={urgencyTone} className="text-[10px] mt-1">
              {urgency} urgency
            </Badge>
          </div>
        </div>

        {/* History timeline — audit trail since denial (EMR-985) */}
        {historyOpen && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-[10px] font-medium uppercase tracking-wide text-amber-800 mb-3">
              Claim history
            </p>
            {timeline.length <= 1 ? (
              <>
                <TimelineList entries={timeline} />
                <p className="mt-2 text-[11px] text-text-subtle italic">
                  No further activity recorded yet.
                </p>
              </>
            ) : (
              <TimelineList entries={timeline} />
            )}
          </div>
        )}

        {/* Triage box */}
        <div className="bg-danger/[0.04] border border-danger/15 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone="danger" className="text-[9px]">
              {triageLabel}
            </Badge>
            <span className="font-mono text-[10px] text-text-subtle">
              {triageCategory}
            </span>
          </div>
          <p className="text-sm text-text leading-snug mb-2">
            {triageDescription}
          </p>
          {denialReason && (
            <p className="text-xs text-text-muted italic">
              Payer message: &ldquo;{denialReason}&rdquo;
            </p>
          )}
        </div>

        {/* Suggested action */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>Suggested action:</span>
            <Badge tone="accent">{suggestedActionLabel}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/clinic/patients/${patientId}/billing`}
              className="text-xs text-text-muted hover:text-text"
            >
              Open chart
            </Link>
            <button className="text-xs font-medium px-3 py-1.5 rounded-md bg-accent text-accent-ink hover:bg-accent/90">
              Take action
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TimelineList({ entries }: { entries: TimelineEntry[] }) {
  return (
    <ol className="relative space-y-3">
      {entries.map((entry, i) => (
        <li key={i} className="relative flex items-start gap-3 pl-1">
          {/* connector line (not on the last item) */}
          {i < entries.length - 1 && (
            <span
              className="absolute left-[5px] top-3 h-full w-px bg-amber-200"
              aria-hidden="true"
            />
          )}
          <span
            className={cn(
              "relative z-10 mt-1 h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-amber-50",
              KIND_DOT[entry.kind],
            )}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-xs font-medium text-text leading-snug">
              {entry.label}
            </p>
            <p className="text-[10px] tabular-nums text-text-subtle">
              {entry.date ? formatDate(entry.date) : "Date unknown"}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
