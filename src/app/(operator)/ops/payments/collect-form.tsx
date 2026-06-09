"use client";

import * as React from "react";
import { useFormState } from "react-dom";
import { useRouter } from "next/navigation";
import { SubmitButton } from "@/lib/ui/form-helpers";
import {
  collectPayment,
  type CollectResult,
} from "@/app/(clinician)/clinic/patients/[id]/billing/actions";

/**
 * Inline collect form for the front-desk payments worklist. Reuses the
 * existing `collectPayment` server action verbatim — same gateway routing,
 * idempotency, ledger writes, and audit — so there is no second money path to
 * keep in sync.
 */
export function CollectForm({
  patientId,
  defaultAmountCents,
  liveProcessor,
}: {
  patientId: string;
  defaultAmountCents: number;
  liveProcessor: boolean;
}) {
  const router = useRouter();
  const [state, formAction] = useFormState<CollectResult | null, FormData>(
    collectPayment,
    null,
  );
  const [dollars, setDollars] = React.useState(
    (defaultAmountCents / 100).toFixed(2),
  );

  React.useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const parsed = parseFloat(dollars);
  const cents = Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="amountCents" value={cents} />
      <div className="relative">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-sm text-text-subtle">
          $
        </span>
        <input
          inputMode="decimal"
          value={dollars}
          onChange={(e) => setDollars(e.target.value)}
          aria-label="Amount"
          className="h-9 w-24 rounded-md border border-border-strong/70 bg-surface pl-5 pr-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        />
      </div>
      <select
        name="method"
        defaultValue={liveProcessor ? "card" : "cash"}
        aria-label="Payment method"
        className="h-9 rounded-md border border-border-strong/70 bg-surface px-2 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
      >
        <option value="card">Card</option>
        <option value="cash">Cash</option>
        <option value="check">Check</option>
        <option value="ach">ACH</option>
      </select>
      <SubmitButton
        size="sm"
        variant="secondary"
        idleLabel="Collect"
        pendingLabel="Collecting…"
        disabled={cents < 1}
        className="min-w-0"
      />
      {state && !state.ok && (
        <span className="w-full text-xs text-danger md:w-auto">{state.error}</span>
      )}
    </form>
  );
}
