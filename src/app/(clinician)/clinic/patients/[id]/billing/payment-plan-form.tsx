"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createPaymentPlanAction, type PaymentPlanResult } from "./actions";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/ui/modal-shell";

// Mirror of the engine limits in src/lib/billing/payment-plans.ts so the
// dialog can validate inline before the round-trip (the server re-validates).
const MIN_INSTALLMENT_CENTS = 5_000; // $50
const MAX_INSTALLMENT_CENTS = 50_000; // $500
const MIN_COUNT = 3;
const MAX_COUNT = 24;

type Frequency = "monthly" | "biweekly" | "weekly";

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PaymentPlanForm({
  patientId,
  outstandingCents,
}: {
  patientId: string;
  outstandingCents: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useFormState<PaymentPlanResult | null, FormData>(
    createPaymentPlanAction,
    null,
  );

  // Defaults: spread the outstanding balance over a sensible installment that
  // lands inside the engine's limits. Aim for ~6 installments, clamped.
  const defaultTotal = outstandingCents > 0 ? outstandingCents : 30_000;
  const suggestedInstallment = Math.min(
    MAX_INSTALLMENT_CENTS,
    Math.max(MIN_INSTALLMENT_CENTS, Math.ceil(defaultTotal / 6 / 100) * 100),
  );

  const [total, setTotal] = useState((defaultTotal / 100).toFixed(2));
  const [installment, setInstallment] = useState((suggestedInstallment / 100).toFixed(2));
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [startDate, setStartDate] = useState(todayISO());
  const [autopay, setAutopay] = useState(true);

  const totalCents = Math.round((parseFloat(total) || 0) * 100);
  const installmentCents = Math.round((parseFloat(installment) || 0) * 100);

  const preview = useMemo(() => {
    if (totalCents <= 0 || installmentCents <= 0) return null;
    const count = Math.ceil(totalCents / installmentCents);
    const finalCents = totalCents - installmentCents * (count - 1);
    return { count, finalCents };
  }, [totalCents, installmentCents]);

  const validationError = useMemo(() => {
    if (totalCents <= 0) return "Enter a balance to spread.";
    if (installmentCents < MIN_INSTALLMENT_CENTS || installmentCents > MAX_INSTALLMENT_CENTS) {
      return `Installment must be between ${fmt(MIN_INSTALLMENT_CENTS)} and ${fmt(MAX_INSTALLMENT_CENTS)}.`;
    }
    if (preview && (preview.count < MIN_COUNT || preview.count > MAX_COUNT)) {
      return `That yields ${preview.count} installments — must be ${MIN_COUNT}–${MAX_COUNT}. Adjust the installment amount.`;
    }
    return null;
  }, [totalCents, installmentCents, preview]);

  const dirty =
    total !== (defaultTotal / 100).toFixed(2) ||
    installment !== (suggestedInstallment / 100).toFixed(2) ||
    frequency !== "monthly" ||
    startDate !== todayISO() ||
    !autopay;

  if (state?.ok) {
    return (
      <div className="text-center py-4">
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
          Plan created — {state.installmentCount} installments
        </div>
        <p className="text-xs text-text-muted mt-3">Refresh to see the active plan.</p>
      </div>
    );
  }

  return (
    <div className="text-center py-4">
      <p className="text-sm text-text-muted mb-3">
        Offer a payment plan to break large balances into manageable installments.
      </p>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={outstandingCents <= 0}
      >
        Enroll in payment plan
      </Button>
      {outstandingCents <= 0 && (
        <p className="text-[11px] text-text-subtle mt-2">No balance to spread.</p>
      )}

      <ModalShell
        open={open}
        onClose={() => setOpen(false)}
        isDirty={dirty}
        placement="center"
        eyebrow="Payment plan"
        title="Set up installments"
        description="Spread this balance into automatic installments."
      >
        <form action={formAction} className="px-6 py-5 space-y-4 text-left">
          <input type="hidden" name="patientId" value={patientId} />
          <input type="hidden" name="totalAmountCents" value={totalCents} />
          <input type="hidden" name="installmentAmountCents" value={installmentCents} />

          {/* Total to spread */}
          <Field label="Total balance to spread">
            <MoneyInput value={total} onChange={setTotal} />
          </Field>

          {/* Installment amount */}
          <Field
            label="Per-installment amount"
            hint={`Between ${fmt(MIN_INSTALLMENT_CENTS)} and ${fmt(MAX_INSTALLMENT_CENTS)}`}
          >
            <MoneyInput value={installment} onChange={setInstallment} />
          </Field>

          {/* Frequency */}
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
            <input type="hidden" name="frequency" value={frequency} />
          </Field>

          {/* Start date */}
          <Field label="First installment date">
            <input
              type="date"
              name="startDate"
              value={startDate}
              min={todayISO()}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </Field>

          {/* Autopay */}
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

          {/* Schedule preview */}
          {preview && !validationError && (
            <div className="rounded-lg bg-accent/5 border border-accent/10 p-3">
              <p className="text-[10px] font-medium uppercase tracking-wider text-accent mb-1">
                Schedule preview
              </p>
              <p className="text-sm text-text">
                {preview.count} {frequency} installments of {fmt(installmentCents)}
                {preview.finalCents !== installmentCents && (
                  <> (final {fmt(preview.finalCents)})</>
                )}
              </p>
            </div>
          )}

          {validationError && (
            <p className="text-xs text-[color:var(--warning)]">{validationError}</p>
          )}
          {state?.ok === false && (
            <p className="text-xs text-danger">{state.error}</p>
          )}

          <PlanSubmitButton disabled={!!validationError} />
        </form>
      </ModalShell>
    </div>
  );
}

function PlanSubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" className="w-full" disabled={pending || disabled}>
      {pending ? "Creating plan..." : "Create payment plan"}
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
      <div className="flex items-baseline justify-between mb-1">
        <label className="text-[10px] font-medium uppercase tracking-wider text-text-subtle">
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
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">$</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0.00"
        className="w-full pl-7 pr-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50 tabular-nums"
      />
    </div>
  );
}
