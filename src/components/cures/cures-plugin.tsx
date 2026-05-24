"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  simulateCuresQuery,
  pdmpFlagToneAndLabel,
  type CuresSnapshot,
  type NarcanRecommendation,
} from "./cures-client";

/**
 * EMR-781 — Simulated CURES database plugin embedded in the
 * clinician prescribing module. Provides:
 *
 *   - Manual "Query CURES" action that returns a deterministic
 *     snapshot of the patient's controlled-substance history.
 *   - Acknowledge-and-attest checkbox so the prescriber records that
 *     they reviewed the snapshot before signing the Rx.
 *   - Narcan co-prescribing recommendation panel when opioids are
 *     detected in the current Rx or active medications.
 *
 * The plugin participates in the form via hidden inputs so the server
 * action sees the attestation payload alongside the rest of the
 * prescription form data.
 */
export interface CuresPluginProps {
  patientId: string;
  patientName: string;
  /** Names of the patient's existing active medications. */
  existingMedicationNames: string[];
  /** Name of the medication the prescriber is about to create. */
  candidateMedicationName: string | null;
  narcan: NarcanRecommendation;
  onCuresAcknowledgedChange?: (acknowledged: boolean) => void;
  onNarcanDecisionChange?: (decision: "co_prescribe" | "declined" | null) => void;
}

export function CuresPlugin({
  patientId,
  patientName,
  existingMedicationNames,
  candidateMedicationName,
  narcan,
  onCuresAcknowledgedChange,
  onNarcanDecisionChange,
}: CuresPluginProps) {
  const [snapshot, setSnapshot] = React.useState<CuresSnapshot | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [narcanDecision, setNarcanDecision] =
    React.useState<"co_prescribe" | "declined" | null>(null);
  const [declineReason, setDeclineReason] = React.useState("");

  const runQuery = React.useCallback(() => {
    setLoading(true);
    // Simulated latency so the UI feels like a real network call.
    window.setTimeout(() => {
      const snap = simulateCuresQuery({
        patientId,
        medicationNames: [
          ...existingMedicationNames,
          ...(candidateMedicationName ? [candidateMedicationName] : []),
        ],
      });
      setSnapshot(snap);
      setLoading(false);
    }, 350);
  }, [patientId, existingMedicationNames, candidateMedicationName]);

  React.useEffect(() => {
    onCuresAcknowledgedChange?.(acknowledged);
  }, [acknowledged, onCuresAcknowledgedChange]);

  React.useEffect(() => {
    onNarcanDecisionChange?.(narcanDecision);
  }, [narcanDecision, onNarcanDecisionChange]);

  return (
    <Card className="border-l-4 border-l-accent bg-accent-soft/20">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            🛡️
          </span>
          CURES database
          <Badge tone="accent" className="text-[10px] uppercase tracking-wider">
            Simulated
          </Badge>
        </CardTitle>
        <CardDescription>
          Run a Controlled Substance Utilization Review &amp; Evaluation System
          (CURES) lookup for {patientName} to see their controlled-substance
          history and safety parameters before signing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* ── Query controls ──────────────────────────────────── */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-xs text-text-muted">
            {snapshot
              ? `Queried at ${formatDateTime(snapshot.queriedAt)} · ${snapshot.lookbackMonths}-month lookback`
              : "No query run yet. Press the button to fetch the latest CURES snapshot."}
          </div>
          <Button
            type="button"
            variant={snapshot ? "secondary" : "primary"}
            size="md"
            disabled={loading}
            onClick={runQuery}
          >
            {loading ? "Querying CURES…" : snapshot ? "Re-run CURES query" : "Query CURES"}
          </Button>
        </div>

        {/* ── Snapshot display ────────────────────────────────── */}
        {snapshot && (
          <div className="space-y-4">
            <SafetySummary snapshot={snapshot} />
            <PrescriptionsTable snapshot={snapshot} />
            <Flags snapshot={snapshot} />

            <label className="flex items-start gap-2 text-xs text-text border-t border-border pt-4">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border-strong accent-accent"
              />
              <span>
                I reviewed this CURES snapshot, including all flags and MME
                totals, and confirmed it is consistent with my plan of care.
              </span>
            </label>

            {/* Form integration */}
            <input
              type="hidden"
              name="curesQueriedAt"
              value={snapshot.queriedAt}
            />
            <input
              type="hidden"
              name="curesFlags"
              value={JSON.stringify(snapshot.flags)}
            />
            <input
              type="hidden"
              name="curesMmePerDay"
              value={String(snapshot.totalMmePerDay)}
            />
            {acknowledged && (
              <input type="hidden" name="curesAcknowledged" value="true" />
            )}
          </div>
        )}

        {/* ── Narcan recommendation ───────────────────────────── */}
        {narcan.recommended && (
          <NarcanPanel
            narcan={narcan}
            decision={narcanDecision}
            declineReason={declineReason}
            onDecisionChange={setNarcanDecision}
            onDeclineReasonChange={setDeclineReason}
          />
        )}
      </CardContent>
    </Card>
  );
}

/* ── Subcomponents ─────────────────────────────────────────────── */

function SafetySummary({ snapshot }: { snapshot: CuresSnapshot }) {
  return (
    <div className="rounded-xl bg-white border border-border p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle mb-1.5">
        Safety summary
      </p>
      <p className="text-sm text-text leading-relaxed">{snapshot.safetySummary}</p>
      {snapshot.totalMmePerDay > 0 && (
        <div className="mt-3 flex items-center gap-2">
          <Badge
            tone={snapshot.totalMmePerDay >= 50 ? "danger" : "warning"}
            className="text-[10px] uppercase"
          >
            ~{snapshot.totalMmePerDay} MME/day
          </Badge>
          {snapshot.totalMmePerDay >= 50 && (
            <span className="text-xs text-danger">
              Above CDC 50 MME/day threshold
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function PrescriptionsTable({ snapshot }: { snapshot: CuresSnapshot }) {
  if (snapshot.prescriptions.length === 0) {
    return (
      <div className="rounded-xl bg-white border border-border p-4">
        <p className="text-sm text-text-muted italic">
          No active controlled-substance prescriptions in the lookback window.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-white border border-border overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border bg-surface-raised">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle">
          Controlled substance history ({snapshot.prescriptions.length})
        </p>
      </div>
      <div className="divide-y divide-border">
        {snapshot.prescriptions.map((rx, idx) => (
          <div
            key={`${rx.drug}-${idx}`}
            className="px-4 py-3 grid grid-cols-12 gap-2 items-center text-sm"
          >
            <div className="col-span-4 min-w-0">
              <p className="font-medium text-text truncate" title={rx.drug}>
                {rx.drug}
              </p>
              <p className="text-[11px] text-text-subtle">
                Schedule {rx.schedule}
              </p>
            </div>
            <div className="col-span-3 min-w-0">
              <p className="text-xs text-text truncate" title={rx.prescriber}>
                {rx.prescriber}
              </p>
              <p className="text-[11px] text-text-subtle truncate" title={rx.pharmacy}>
                {rx.pharmacy}
              </p>
            </div>
            <div className="col-span-3 text-xs text-text-muted">
              {rx.quantity} units · {rx.daysSupply}d supply
              <p className="text-[11px] text-text-subtle">
                {rx.fills} fill{rx.fills === 1 ? "" : "s"} on file
              </p>
            </div>
            <div className="col-span-2 text-right">
              <p className="text-xs text-text-muted">Last fill</p>
              <p className="text-xs font-medium text-text">{rx.lastFillDate}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Flags({ snapshot }: { snapshot: CuresSnapshot }) {
  if (snapshot.flags.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {snapshot.flags.map((flag) => {
        const { tone, label } = pdmpFlagToneAndLabel(flag);
        return (
          <Badge key={flag} tone={tone} className="text-[11px]">
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

function NarcanPanel({
  narcan,
  decision,
  declineReason,
  onDecisionChange,
  onDeclineReasonChange,
}: {
  narcan: NarcanRecommendation;
  decision: "co_prescribe" | "declined" | null;
  declineReason: string;
  onDecisionChange: (d: "co_prescribe" | "declined" | null) => void;
  onDeclineReasonChange: (r: string) => void;
}) {
  return (
    <div className="rounded-xl border-2 border-danger/40 bg-red-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-2xl" aria-hidden>
          🚑
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-danger">
            Naloxone (Narcan) co-prescribing recommended
          </p>
          <p className="text-sm text-text-muted mt-1 leading-relaxed">
            {narcan.rationale}
          </p>
          <p className="text-[11px] text-text-subtle mt-2">
            Detected opioid{narcan.opioids.length === 1 ? "" : "s"}:{" "}
            <span className="font-medium">{narcan.opioids.join(", ")}</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-danger/20">
        <label
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs cursor-pointer transition-colors ${
            decision === "co_prescribe"
              ? "border-accent bg-accent-soft/50"
              : "border-border bg-white hover:border-accent/40"
          }`}
        >
          <input
            type="radio"
            name="narcanDecision"
            value="co_prescribe"
            checked={decision === "co_prescribe"}
            onChange={() => onDecisionChange("co_prescribe")}
            className="mt-0.5 h-4 w-4 accent-accent"
          />
          <span>
            <span className="font-medium text-text block">
              Yes — co-prescribe Narcan
            </span>
            <span className="text-text-muted">
              Naloxone 4mg nasal spray will be added to this patient's plan and
              the counseling note logged.
            </span>
          </span>
        </label>
        <label
          className={`flex items-start gap-2 rounded-lg border p-3 text-xs cursor-pointer transition-colors ${
            decision === "declined"
              ? "border-warning bg-[color:var(--warning)]/[0.08]"
              : "border-border bg-white hover:border-warning/40"
          }`}
        >
          <input
            type="radio"
            name="narcanDecision"
            value="declined"
            checked={decision === "declined"}
            onChange={() => onDecisionChange("declined")}
            className="mt-0.5 h-4 w-4 accent-amber-500"
          />
          <span>
            <span className="font-medium text-text block">
              No — declined / not indicated
            </span>
            <span className="text-text-muted">
              Document the clinical reason. The decision is recorded in the
              audit log alongside the prescription.
            </span>
          </span>
        </label>
      </div>

      {decision === "declined" && (
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-text-subtle mb-1.5">
            Reason for declining Narcan (required)
          </label>
          <textarea
            value={declineReason}
            onChange={(e) => onDeclineReasonChange(e.target.value)}
            rows={3}
            placeholder="e.g. Patient already has unexpired Narcan at home (verified)."
            className="w-full rounded-md border border-border-strong bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <input type="hidden" name="narcanDeclineReason" value={declineReason} />
        </div>
      )}

      {decision === "co_prescribe" && (
        <input type="hidden" name="narcanCoPrescribe" value="true" />
      )}
    </div>
  );
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
