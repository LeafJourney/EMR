"use client";

import { useState } from "react";
import Link from "next/link";
import { 
  Check, 
  Sparkles, 
  FileEdit, 
  ShieldAlert, 
  Users, 
  AlertCircle 
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { ModalShell } from "@/components/ui/modal-shell";
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
  const [actionOpen, setActionOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  // EMR-982 — sub-choice for the corrected-claim path: route via clearinghouse
  // or a specific payer portal.
  const [correctedRoute, setCorrectedRoute] = useState<
    "clearinghouse" | "availity" | "uhc_link" | "optum"
  >("clearinghouse");

  const CORRECTED_ROUTE_LABEL: Record<typeof correctedRoute, string> = {
    clearinghouse: "the clearinghouse",
    availity: "the Availity portal",
    uhc_link: "the UnitedHealthcare Link portal",
    optum: "the Optum portal",
  };

  const handleExecuteAction = (type: "corrected" | "coding" | "peer") => {
    setActionOpen(false);
    if (type === "corrected") {
      setSuccessMessage(
        `Corrected claim successfully compiled and resubmitted via ${CORRECTED_ROUTE_LABEL[correctedRoute]}.`,
      );
    } else if (type === "coding") {
      setSuccessMessage("Redirecting to Coding workspace to modify CPT/ICD codes.");
    } else {
      setSuccessMessage("Peer-to-peer review scheduling ticket created for provider.");
    }
    setTimeout(() => setSuccessMessage(null), 5000);
  };

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
        {/* Success Action Alert Banner */}
        {successMessage && (
          <div className="mb-4 p-3 rounded-lg bg-[color:var(--accent-soft)] text-success border border-[color:var(--success)]/20 text-xs font-semibold flex items-center gap-2 animate-in fade-in duration-200">
            <Check className="w-4 h-4 shrink-0" />
            {successMessage}
          </div>
        )}

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
                <div className="flex items-center gap-1.5 mt-0.5">
                  <p className="text-[11px] text-text-subtle">
                    Denied {deniedRelative}
                  </p>
                  <button
                    type="button"
                    onClick={() => setHistoryOpen((o) => !o)}
                    aria-expanded={historyOpen}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border border-amber-200 px-2 py-0.5 text-[10px] font-semibold transition-colors",
                      "bg-amber-50 text-amber-850 hover:bg-amber-100",
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
            <p className="font-display text-xl text-text tabular-nums font-semibold">
              {billedLabel}
            </p>
            <Badge tone={urgencyTone} className="text-[10px] mt-1 font-semibold capitalize">
              {urgency}
            </Badge>
          </div>
        </div>

        {/* History timeline — audit trail since denial (EMR-985) */}
        {historyOpen && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50/60 p-4">
            <p className="text-[10px] font-bold uppercase tracking-wide text-amber-800 mb-3">
              Claim History Log
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

        {/* Triage box - EMR-978: "Cindy suggests" label; redundant category code
            + duplicate description line removed (kept the human-readable label). */}
        <div className="bg-danger/[0.04] border border-danger/15 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Badge tone="danger" className="text-[9.5px] font-semibold flex items-center gap-0.5">
              <Sparkles className="w-2.5 h-2.5" />
              Cindy suggests
            </Badge>
            <span className="text-[11px] text-text font-semibold">{triageLabel}</span>
          </div>
          {denialReason && (
            <p className="text-[11px] text-text-muted italic border-l border-border/50 pl-2 mt-1.5">
              Payer message: &ldquo;{denialReason}&rdquo;
            </p>
          )}
        </div>

        {/* Suggested action */}
        <div className="flex items-center justify-between pt-2 border-t border-border/60">
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <span>Cindy suggests</span>
            <Badge tone="accent" className="font-semibold">{suggestedActionLabel}</Badge>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/clinic/patients/${patientId}/billing`}
              className="text-xs text-text-subtle hover:text-text font-semibold mr-1"
            >
              Open chart
            </Link>
            <button 
              type="button"
              onClick={() => setActionOpen(true)}
              className="text-xs font-semibold px-3 py-1.5 rounded-md bg-accent text-accent-ink hover:bg-accent/90 transition-colors shadow-sm"
            >
              Take action
            </button>
          </div>
        </div>
      </CardContent>

      {/* 3-Option Take Action Modal */}
      <ModalShell
        open={actionOpen}
        onClose={() => setActionOpen(false)}
        title="Resolve Claim Denial"
        description="Select a resolution workflow suggested by billing intelligence."
      >
        <div className="px-6 py-5 space-y-4">
          <div className="rounded-lg border bg-surface-muted/40 p-3 flex flex-col gap-1 text-xs">
            <span className="text-[10px] font-bold text-text-subtle uppercase">Target Claim</span>
            <span className="font-semibold text-text">{patientFirstName} {patientLastName} (Claim #{claimNumber ?? "—"})</span>
            <span className="text-text-muted font-mono">{payerName} · Billed {billedLabel}</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {/* Pathway 1 — EMR-982: route sub-choice (clearinghouse vs payer portal) */}
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="flex items-start gap-3">
                <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0 border border-blue-100">
                  <FileEdit className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-text">Corrected Claim &amp; Resubmit</p>
                  <p className="text-[11px] text-text-subtle mt-0.5">Submit an updated CMS-1500 with corrected insurer/subscriber info or attachments.</p>
                </div>
              </div>
              <div className="mt-3 pl-11">
                <p className="text-[10px] font-bold uppercase tracking-wide text-text-subtle mb-1.5">
                  Submit via
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {([
                    { key: "clearinghouse", label: "Clearinghouse" },
                    { key: "availity", label: "Availity" },
                    { key: "uhc_link", label: "UnitedHealthcare Link" },
                    { key: "optum", label: "Optum" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setCorrectedRoute(opt.key)}
                      aria-pressed={correctedRoute === opt.key}
                      className={cn(
                        "px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors",
                        correctedRoute === opt.key
                          ? "bg-accent text-accent-ink border-accent"
                          : "bg-surface-muted text-text-muted border-border hover:bg-surface-raised",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-text-subtle mt-1.5">
                  {correctedRoute === "clearinghouse"
                    ? "Routes the corrected 837 through your clearinghouse."
                    : "Submits the corrected claim directly through the payer portal."}
                </p>
                <button
                  type="button"
                  onClick={() => handleExecuteAction("corrected")}
                  className="mt-2.5 w-full text-xs font-semibold px-3 py-1.5 rounded-md bg-accent text-accent-ink hover:bg-accent/90 transition-colors shadow-sm"
                >
                  Resubmit corrected claim
                </button>
              </div>
            </div>

            {/* Pathway 2 */}
            <button
              type="button"
              onClick={() => handleExecuteAction("coding")}
              className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface hover:border-accent/40 hover:bg-surface-raised transition-all text-left"
            >
              <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 border border-amber-100">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-text">Fix Coding (Modifier / CPT)</p>
                <p className="text-[11px] text-text-subtle mt-0.5">Edit billing line items or attach appropriate modifiers (e.g., modifier 25/59) to prevent bundling.</p>
              </div>
            </button>

            {/* Pathway 3 */}
            <button
              type="button"
              onClick={() => handleExecuteAction("peer")}
              className="flex items-start gap-3 p-3 rounded-xl border border-border bg-surface hover:border-accent/40 hover:bg-surface-raised transition-all text-left"
            >
              <div className="h-8 w-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0 border border-green-100">
                <Users className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-text">Peer-to-Peer Review Appeal</p>
                <p className="text-[11px] text-text-subtle mt-0.5">Request a conversation between our clinician and the insurance medical director to appeal medical necessity.</p>
              </div>
            </button>
          </div>

          <div className="flex justify-end pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => setActionOpen(false)}
              className="px-4 py-1.5 rounded-lg border hover:bg-surface-raised text-xs font-semibold"
            >
              Cancel
            </button>
          </div>
        </div>
      </ModalShell>
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
