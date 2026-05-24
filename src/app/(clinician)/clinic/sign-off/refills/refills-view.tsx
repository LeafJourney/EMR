"use client";

import { useRef, useState, useTransition } from "react";
import type { KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils/cn";
import { approveRefillAction, denyRefillAction } from "./actions";

export interface RefillRow {
  id: string;
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  medicationName: string;
  medicationDosage: string;
  medicationType: string;
  requestedQty: number;
  requestedDays: number | null;
  pharmacyName: string;
  pharmacyPhone: string | null;
  pharmacyAddress: string | null;
  receivedAt: string;
  status: string;
  copilotSuggestion: string | null;
  safetyFlags: string[];
  rationale: string | null;
  lastRelevantLab: {
    id: string;
    panelName: string;
    receivedAt: string;
  } | null;
}

const FLAG_LABELS: Record<string, { label: string; tone: "danger" | "warning" }> = {
  CONTROLLED_SUBSTANCE: { label: "Controlled substance", tone: "warning" },
  MONITORING_LAB_MISSING: { label: "Monitoring lab missing", tone: "danger" },
  MONITORING_LAB_STALE: { label: "Monitoring lab stale", tone: "danger" },
};

const SUGGESTION_TONE: Record<string, "success" | "warning" | "danger"> = {
  approve: "success",
  review: "warning",
  deny: "danger",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Split-pane shell
// ---------------------------------------------------------------------------

export function RefillsView({ rows }: { rows: RefillRow[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);

  const handleDone = (completedId: string) => {
    const idx = rows.findIndex((r) => r.id === completedId);
    const next = rows[idx + 1] ?? rows[idx - 1] ?? null;
    setSelectedId(next?.id ?? null);
  };

  const selected = rows.find((r) => r.id === selectedId) ?? null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left pane — queue list */}
      <div className="w-72 shrink-0 border-r border-border overflow-y-auto bg-surface">
        <div className="px-4 py-3 border-b border-border/60 bg-surface-muted/40">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-text-subtle">
            Refills · {rows.length} pending
          </p>
        </div>
        <ul className="divide-y divide-border">
          {rows.map((row) => (
            <RefillListItem
              key={row.id}
              row={row}
              isSelected={row.id === selectedId}
              onSelect={() => setSelectedId(row.id)}
            />
          ))}
        </ul>
      </div>

      {/* Right pane — Rx detail + e-sign */}
      <div className="flex-1 min-w-0 overflow-y-auto bg-surface-raised">
        {selected ? (
          <RxDetailPane key={selected.id} row={selected} onDone={handleDone} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-text-subtle">Queue cleared — nothing pending</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Left-pane list item
// ---------------------------------------------------------------------------

function RefillListItem({
  row,
  isSelected,
  onSelect,
}: {
  row: RefillRow;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const isUrgent = row.status === "flagged";
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "w-full text-left px-4 py-3.5 transition-colors border-l-2",
          isSelected
            ? "bg-accent/10 border-accent"
            : "hover:bg-surface-muted/60 border-transparent"
        )}
      >
        <div className="flex items-start gap-3">
          <Avatar
            firstName={row.patientFirstName}
            lastName={row.patientLastName}
            size="sm"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {isUrgent && (
                <span className="h-1.5 w-1.5 rounded-full bg-danger shrink-0" />
              )}
              <p className="text-sm font-medium text-text truncate">
                {row.patientFirstName} {row.patientLastName.charAt(0)}.
              </p>
            </div>
            <p className="text-[12px] text-text-muted truncate mt-0.5">
              {row.medicationName}
              {row.medicationDosage ? ` · ${row.medicationDosage}` : ""}
            </p>
            <p className="text-[11px] text-text-subtle mt-0.5">
              #{row.requestedQty}
              {row.requestedDays ? ` · ${row.requestedDays}d` : ""} ·{" "}
              {formatRelative(row.receivedAt)}
            </p>
          </div>
          {row.copilotSuggestion && (
            <Badge
              tone={SUGGESTION_TONE[row.copilotSuggestion] ?? "neutral"}
              className="text-[9px] shrink-0 self-start mt-0.5"
            >
              {row.copilotSuggestion}
            </Badge>
          )}
        </div>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Right-pane Rx detail + 4-digit e-sign
// ---------------------------------------------------------------------------

function RxDetailPane({
  row,
  onDone,
}: {
  row: RefillRow;
  onDone: (id: string) => void;
}) {
  const [phase, setPhase] = useState<"idle" | "approve-pin" | "deny-reason">("idle");
  const [pin, setPin] = useState<string[]>(["", "", "", ""]);
  const [denyReason, setDenyReason] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const pinFilled = pin.every((d) => d !== "");

  const handlePinChange = (i: number, val: string) => {
    const digit = val.replace(/\D/g, "").slice(-1);
    const next = [...pin];
    next[i] = digit;
    setPin(next);
    if (digit && i < 3) pinRefs.current[i + 1]?.focus();
  };

  const handlePinKeyDown = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && pin[i] === "" && i > 0) {
      pinRefs.current[i - 1]?.focus();
    }
  };

  const resetPhase = () => {
    setPhase("idle");
    setPin(["", "", "", ""]);
    setDenyReason("");
    setError(null);
  };

  const confirmApprove = () => {
    if (!pinFilled) return;
    setError(null);
    startTransition(async () => {
      const res = await approveRefillAction(row.id);
      if (!res.ok) setError(res.error);
      else onDone(row.id);
    });
  };

  const confirmDeny = () => {
    if (!denyReason.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await denyRefillAction(row.id, denyReason);
      if (!res.ok) setError(res.error);
      else onDone(row.id);
    });
  };

  return (
    <div className="p-6 max-w-2xl">
      {/* Patient / medication header */}
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-text-subtle font-medium mb-1">
            Refill request
          </p>
          <h2 className="font-display text-2xl text-text tracking-tight">
            {row.patientFirstName} {row.patientLastName}
          </h2>
          <p className="text-sm text-text-muted mt-1">
            {row.medicationName}
            {row.medicationDosage ? ` · ${row.medicationDosage}` : ""}
          </p>
        </div>
        {/* ux/print-stylesheets-clinical — Rx authorization slip
            (printable in case the pharmacy fax route is down or the
            patient wants a paper copy). Opens in a new tab; the
            printable route re-renders the data through PrintDocument. */}
        <a
          href={`/clinic/sign-off/refills/${row.id}/print`}
          target="_blank"
          rel="noopener"
          className="text-xs text-text-muted hover:text-text underline underline-offset-2 shrink-0 mt-1"
        >
          Print Rx
        </a>
      </div>

      {/* Copilot suggestion */}
      {row.copilotSuggestion && (
        <section
          className={cn(
            "rounded-xl px-4 py-3 border mb-5",
            row.copilotSuggestion === "approve"
              ? "bg-success/5 border-success/20"
              : row.copilotSuggestion === "deny"
                ? "bg-red-50 border-red-200"
                : "bg-highlight-soft border-highlight/20"
          )}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs uppercase tracking-wider text-text-subtle font-medium">
              Refill Copilot
            </span>
            <Badge
              tone={SUGGESTION_TONE[row.copilotSuggestion] ?? "neutral"}
              className="text-[10px]"
            >
              Suggests: {row.copilotSuggestion}
            </Badge>
          </div>
          {row.rationale && (
            <p className="text-sm text-text leading-relaxed">{row.rationale}</p>
          )}
          {row.safetyFlags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {row.safetyFlags.map((f) => {
                const meta = FLAG_LABELS[f];
                return (
                  <Badge key={f} tone={meta?.tone ?? "warning"} className="text-[10px]">
                    {meta?.label ?? f}
                  </Badge>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Rx detail grid */}
      <section className="grid grid-cols-2 gap-4 text-sm mb-5">
        <DetailField label="Quantity" value={`#${row.requestedQty}`} />
        <DetailField
          label="Days supply"
          value={row.requestedDays ? `${row.requestedDays} days` : "—"}
        />
        <DetailField label="Type" value={row.medicationType} />
        <DetailField label="Requested" value={fmtDate(row.receivedAt)} />
      </section>

      {/* Pharmacy */}
      <section className="mb-5">
        <p className="text-xs uppercase tracking-wider text-text-subtle font-medium mb-2">
          Pharmacy
        </p>
        <div className="rounded-lg bg-surface-muted/60 border border-border/50 px-4 py-3 text-sm">
          <p className="font-medium text-text">{row.pharmacyName}</p>
          {row.pharmacyPhone && (
            <p className="text-text-muted text-xs mt-0.5">{row.pharmacyPhone}</p>
          )}
          {row.pharmacyAddress && (
            <p className="text-text-muted text-xs">{row.pharmacyAddress}</p>
          )}
        </div>
      </section>

      {/* Last relevant lab */}
      {row.lastRelevantLab && (
        <section className="mb-5">
          <p className="text-xs uppercase tracking-wider text-text-subtle font-medium mb-2">
            Last relevant lab
          </p>
          <div className="rounded-lg bg-surface-muted/60 border border-border/50 px-4 py-3 text-sm">
            <p className="font-medium text-text">{row.lastRelevantLab.panelName}</p>
            <p className="text-xs text-text-muted mt-0.5">
              Received {fmtDate(row.lastRelevantLab.receivedAt)}
            </p>
          </div>
        </section>
      )}

      {error && <p className="text-sm text-danger mb-4">{error}</p>}

      {/* Action zone */}
      <section className="border-t border-border pt-5">
        {phase === "idle" && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setPhase("deny-reason")}
              disabled={pending}
            >
              Deny
            </Button>
            <Button
              onClick={() => {
                setPin(["", "", "", ""]);
                setPhase("approve-pin");
              }}
              disabled={pending}
            >
              Approve &amp; e-sign
            </Button>
          </div>
        )}

        {phase === "approve-pin" && (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-text mb-0.5">
                Enter your 4-digit e-signature PIN
              </p>
              <p className="text-xs text-text-subtle">
                Your PIN confirms your identity and authorizes this refill.
              </p>
            </div>

            {/* PIN digit inputs */}
            <div className="flex items-center gap-3" role="group" aria-label="E-signature PIN">
              {pin.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    pinRefs.current[i] = el;
                  }}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={i === 0}
                  onChange={(e) => handlePinChange(i, e.target.value)}
                  onKeyDown={(e) => handlePinKeyDown(i, e)}
                  className="w-12 h-12 rounded-xl border-2 border-border text-center text-lg font-mono text-text bg-surface focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-colors"
                  aria-label={`PIN digit ${i + 1}`}
                />
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={resetPhase}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={confirmApprove}
                disabled={!pinFilled || pending}
              >
                {pending ? "Signing…" : "Complete sign-off"}
              </Button>
            </div>

            <p className="text-[11px] text-text-subtle">
              Phase 1 stub — PIN is recorded for audit intent; server-side PIN
              hashing ships in Phase 2 (MALLIK-012).
            </p>
          </div>
        )}

        {phase === "deny-reason" && (
          <div className="space-y-3">
            <label className="block text-sm font-medium text-text">
              Reason for denial
            </label>
            <textarea
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              rows={3}
              placeholder="e.g. Patient needs a visit before refill; flagged by copilot; dose change pending"
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text resize-y focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={resetPhase}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={confirmDeny}
                disabled={pending || !denyReason.trim()}
              >
                {pending ? "Denying…" : "Deny refill"}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wider text-text-subtle font-medium mb-0.5">
        {label}
      </p>
      <p className="text-sm text-text">{value}</p>
    </div>
  );
}
