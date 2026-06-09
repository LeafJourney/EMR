"use client";

/**
 * DenialActionForm — EMR-980.
 *
 * "Take action" on a denied claim from the billing dashboard. The biller can
 * respond / refute / adjust, route to the correct insurance department, type a
 * justification, and send. Sending calls the `takeDenialAction` server action,
 * which simulates the outbound, writes an append-only audit entry, and posts a
 * note into the patient's chart Correspondence tab.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { takeDenialAction, type TakeActionResult } from "./actions";

const ACTION_TYPES = [
  { key: "respond", label: "Respond" },
  { key: "refute", label: "Refute" },
  { key: "adjust", label: "Adjust off" },
] as const;

type ActionType = (typeof ACTION_TYPES)[number]["key"];

const DEPARTMENTS = [
  "Claims Department",
  "Appeals & Grievances",
  "Provider Relations",
  "Utilization Management / Medical Review",
  "Member Services",
];

export function DenialActionForm({
  claimId,
  patientName,
  claimBalanceCents = 0,
}: {
  claimId: string;
  patientName: string;
  /** Outstanding balance — bounds the write-off / adjustment slider (EMR-980). */
  claimBalanceCents?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [actionType, setActionType] = React.useState<ActionType>("respond");
  const [department, setDepartment] = React.useState(DEPARTMENTS[0]);
  const [justification, setJustification] = React.useState("");
  const [adjustCents, setAdjustCents] = React.useState(0);
  const [pending, startTransition] = React.useTransition();
  const [result, setResult] = React.useState<TakeActionResult | null>(null);

  // The amount slider applies to money-moving actions, not a pure refute.
  const showAmount = actionType !== "refute" && claimBalanceCents > 0;
  const canSend = justification.trim().length > 0 && !pending;

  function submit() {
    if (!canSend) return;
    const fd = new FormData();
    fd.set("claimId", claimId);
    fd.set("actionType", actionType);
    fd.set("department", department);
    // Fold the slider amount into the justification so it lands in the
    // append-only audit note + chart correspondence (the action records the
    // justification text); also send it as a discrete field.
    const amountPrefix =
      showAmount && adjustCents > 0
        ? `[${actionType === "adjust" ? "Write-off" : "Adjustment"}: $${(adjustCents / 100).toFixed(2)} of $${(claimBalanceCents / 100).toFixed(2)} balance] `
        : "";
    fd.set("justification", amountPrefix + justification.trim());
    fd.set("adjustCents", String(showAmount ? adjustCents : 0));
    startTransition(async () => {
      const res = await takeDenialAction(null, fd);
      setResult(res);
      if (res.ok) {
        setJustification("");
        setAdjustCents(0);
      }
    });
  }

  if (!open) {
    return (
      <div className="mt-4 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink shadow-sm hover:bg-accent/90 transition-colors"
        >
          Take action
        </button>
        {result?.ok && (
          <p className="mt-2 text-xs text-success">{result.message}</p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-3">
        Take action — respond, refute, or adjust
      </p>

      {/* Action type */}
      <div className="flex flex-wrap gap-2 mb-3">
        {ACTION_TYPES.map((a) => (
          <button
            key={a.key}
            type="button"
            onClick={() => setActionType(a.key)}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
              actionType === a.key
                ? "bg-accent text-accent-ink border-accent shadow-sm"
                : "bg-surface-muted text-text-muted border-border hover:bg-surface-raised",
            )}
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* EMR-980 — write-off / adjustment amount slider */}
      {showAmount && (
        <div className="mb-3">
          <div className="flex items-baseline justify-between mb-1">
            <label className="text-xs text-text-muted">
              {actionType === "adjust" ? "Write-off amount" : "Adjust claim charge"}
            </label>
            <span className="text-sm tabular-nums font-medium text-text">
              ${(adjustCents / 100).toFixed(2)}
              <span className="text-text-subtle">
                {" "}
                / ${(claimBalanceCents / 100).toFixed(2)}
              </span>
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={claimBalanceCents}
            step={100}
            value={adjustCents}
            onChange={(e) => setAdjustCents(Number(e.target.value))}
            aria-label={actionType === "adjust" ? "Write-off amount" : "Adjustment amount"}
            className="w-full accent-[color:var(--accent)]"
          />
          <div className="flex justify-between text-[10px] text-text-subtle mt-0.5">
            <button type="button" onClick={() => setAdjustCents(0)} className="hover:text-text">
              $0
            </button>
            <button
              type="button"
              onClick={() => setAdjustCents(Math.round(claimBalanceCents / 2))}
              className="hover:text-text"
            >
              50%
            </button>
            <button
              type="button"
              onClick={() => setAdjustCents(claimBalanceCents)}
              className="hover:text-text"
            >
              Full balance
            </button>
          </div>
        </div>
      )}

      {/* Insurance department routing */}
      <label className="block text-xs text-text-muted mb-1">
        Route to insurance department
      </label>
      <select
        value={department}
        onChange={(e) => setDepartment(e.target.value)}
        className="w-full mb-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text"
      >
        {DEPARTMENTS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      {/* Justification */}
      <label className="block text-xs text-text-muted mb-1">
        Denial justification / explanation
      </label>
      <textarea
        value={justification}
        onChange={(e) => setJustification(e.target.value)}
        rows={4}
        placeholder="Explain why this denial is being responded to, refuted, or adjusted…"
        className="w-full mb-3 rounded-md border border-border bg-surface px-3 py-2 text-sm text-text resize-y"
      />

      {result && !result.ok && (
        <p className="mb-2 text-xs text-danger">{result.error}</p>
      )}
      {result?.ok && (
        <p className="mb-2 text-xs text-success">{result.message}</p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!canSend}
          onClick={submit}
          className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink shadow-sm hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? "Sending…" : "Send to payer"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-text-muted hover:text-text px-2 py-1.5"
        >
          Cancel
        </button>
        <span className="ml-auto text-[11px] text-text-subtle">
          Logged to {patientName}&apos;s chart
        </span>
      </div>
    </div>
  );
}
