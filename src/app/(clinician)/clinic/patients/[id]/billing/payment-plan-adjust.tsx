"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import {
  adjustPaymentPlanAction,
  type AdjustPlanActionResult,
} from "./actions";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";

// Adjust an active payment plan (Dr. Patel directive — billing).
// Re-levels installment price, frequency, autopay, and patient reminder
// cadence. Engine limits are mirrored here for inline validation; the server
// re-validates and re-computes the schedule.
const MIN_INSTALLMENT_CENTS = 5_000; // $50
const MAX_INSTALLMENT_CENTS = 50_000; // $500
const MIN_COUNT = 3;
const MAX_COUNT = 24;

type Frequency = "monthly" | "biweekly" | "weekly";
type ReminderCadence = "none" | "weekly" | "3_day" | "1_day";

const REMINDER_OPTIONS: { value: ReminderCadence; label: string }[] = [
  { value: "none", label: "No reminders" },
  { value: "weekly", label: "Weekly" },
  { value: "3_day", label: "3 days before" },
  { value: "1_day", label: "1 day before" },
];

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PaymentPlanAdjust({
  planId,
  patientId,
  installmentAmountCents,
  frequency: currentFrequency,
  autopayEnabled,
  reminderCadence: currentReminder,
  remainingDueCents,
  installmentsPaid,
}: {
  planId: string;
  patientId: string;
  installmentAmountCents: number;
  frequency: Frequency;
  autopayEnabled: boolean;
  reminderCadence: ReminderCadence;
  remainingDueCents: number;
  installmentsPaid: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<AdjustPlanActionResult | null, FormData>(
    adjustPaymentPlanAction,
    null,
  );

  const initialInstallment = (installmentAmountCents / 100).toFixed(2);
  const [installment, setInstallment] = useState(initialInstallment);
  const [frequency, setFrequency] = useState<Frequency>(currentFrequency);
  const [autopay, setAutopay] = useState(autopayEnabled);
  const [reminder, setReminder] = useState<ReminderCadence>(currentReminder);

  const installmentCents = Math.round((parseFloat(installment) || 0) * 100);

  // Total installment count after re-levelling the remaining balance.
  const previewCount = useMemo(() => {
    if (installmentCents <= 0) return null;
    const remaining = Math.max(1, Math.ceil(remainingDueCents / installmentCents));
    return installmentsPaid + remaining;
  }, [installmentCents, remainingDueCents, installmentsPaid]);

  const validationError = useMemo(() => {
    if (installmentCents < MIN_INSTALLMENT_CENTS || installmentCents > MAX_INSTALLMENT_CENTS) {
      return `Installment must be between ${fmt(MIN_INSTALLMENT_CENTS)} and ${fmt(MAX_INSTALLMENT_CENTS)}.`;
    }
    if (previewCount != null && (previewCount < MIN_COUNT || previewCount > MAX_COUNT)) {
      return `That yields ${previewCount} installments — must be ${MIN_COUNT}–${MAX_COUNT}. Adjust the amount.`;
    }
    return null;
  }, [installmentCents, previewCount]);

  const dirty =
    installment !== initialInstallment ||
    frequency !== currentFrequency ||
    autopay !== autopayEnabled ||
    reminder !== currentReminder;

  return (
    <>
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Adjust
      </Button>

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        isDirty={dirty && !state?.ok}
        placement="center"
        eyebrow="Payment plan"
        title="Adjust this plan"
        description="Re-level the remaining balance, cadence, and reminders."
      >
        {state?.ok ? (
          <div className="px-6 py-8 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 text-success text-sm font-medium">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.2" />
                <path
                  d="M4.5 7L6 8.5L9.5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Plan updated — {state.numberOfInstallments} installments
            </div>
            <p className="text-xs text-text-muted mt-3">
              Refresh to see the updated schedule.
            </p>
          </div>
        ) : (
          <form action={formAction} className="px-6 py-5 space-y-4 text-left">
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="patientId" value={patientId} />
            <input type="hidden" name="installmentAmountCents" value={installmentCents} />
            <input type="hidden" name="frequency" value={frequency} />
            <input type="hidden" name="reminderCadence" value={reminder} />

            <Field
              label="Per-installment amount"
              hint={`Between ${fmt(MIN_INSTALLMENT_CENTS)} and ${fmt(MAX_INSTALLMENT_CENTS)}`}
            >
              <MoneyInput value={installment} onChange={setInstallment} />
            </Field>

            <Field label="Frequency">
              <div className="grid grid-cols-3 gap-1">
                {(["monthly", "biweekly", "weekly"] as Frequency[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFrequency(f)}
                    className={`text-[11px] py-1.5 rounded-md transition-all capitalize ${
                      frequency === f
                        ? "bg-accent text-accent-ink shadow-sm"
                        : "bg-surface-muted text-text-muted hover:bg-surface border border-border"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Patient reminders">
              <div className="grid grid-cols-2 gap-1">
                {REMINDER_OPTIONS.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setReminder(r.value)}
                    className={`text-[11px] py-1.5 rounded-md transition-all ${
                      reminder === r.value
                        ? "bg-accent text-accent-ink shadow-sm"
                        : "bg-surface-muted text-text-muted hover:bg-surface border border-border"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </Field>

            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                name="autopayEnabled"
                checked={autopay}
                onChange={(e) => setAutopay(e.target.checked)}
                className="h-4 w-4 rounded border-border text-accent focus:ring-accent/40"
              />
              <span className="text-sm text-text">
                Enable autopay on the card on file
              </span>
            </label>

            {previewCount != null && !validationError && (
              <div className="rounded-lg bg-accent/5 border border-accent/10 p-3">
                <p className="text-[10px] font-medium uppercase tracking-wider text-accent mb-1">
                  Updated schedule
                </p>
                <p className="text-sm text-text">
                  {previewCount} total {frequency} installments of {fmt(installmentCents)}{" "}
                  <span className="text-text-subtle">
                    ({installmentsPaid} already paid · {fmt(remainingDueCents)} remaining)
                  </span>
                </p>
              </div>
            )}

            {validationError && (
              <p className="text-xs text-[color:var(--warning)]">{validationError}</p>
            )}
            {state?.ok === false && (
              <p className="text-xs text-danger">{state.error}</p>
            )}

            <AdjustSubmitButton disabled={!!validationError || !dirty} />
          </form>
        )}
      </ModalShell>
    </>
  );
}

function AdjustSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="w-full" disabled={pending || disabled}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <label className="text-[11px] font-medium uppercase tracking-wider text-text-subtle">
          {label}
        </label>
        {hint && <span className="text-[10px] text-text-subtle">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-subtle text-sm">
        $
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full pl-7 pr-3 py-2 rounded-md border border-border bg-surface text-sm text-text tabular-nums focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
      />
    </div>
  );
}
