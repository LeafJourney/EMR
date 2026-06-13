"use client";

import { useMemo, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { collectPayment, type CollectResult } from "./actions";
import { Button } from "@/components/ui/button";

// UI-level method choices. Note "bitcoin" is a presentation-only option:
// the server action's schema still only accepts card/ach/cash/check, so we
// submit a server-valid `method` value while capturing the crypto-specific
// fields in form state (Dr. Patel directive — UI form fields only, no real
// crypto processing wired here).
type Method = "card" | "ach" | "cash" | "check" | "bitcoin";

/** The value sent to the server action — bitcoin maps onto the closest
 * server-accepted enum so the existing submit path keeps working. */
function serverMethod(m: Method): "card" | "ach" | "cash" | "check" {
  return m === "bitcoin" ? "cash" : m;
}

// Best-effort browser UUID. Falls back to a random-string shim for very
// old browsers that don't expose crypto.randomUUID. Server-side validates
// length (min 8) so both shapes pass.
function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback: 32-char hex-ish string. Not cryptographically strong but
  // still unique enough for double-submit protection on a given device.
  return `idk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function CollectPaymentForm({
  patientId,
  suggestedAmountCents,
  hasCardOnFile,
  cardLast4,
  cardBrand,
}: {
  patientId: string;
  suggestedAmountCents: number;
  hasCardOnFile: boolean;
  cardLast4: string | null;
  cardBrand: string | null;
}) {
  const [state, formAction] = useFormState<CollectResult | null, FormData>(
    collectPayment,
    null,
  );
  const [method, setMethod] = useState<Method>("card");
  const [amount, setAmount] = useState(
    suggestedAmountCents > 0 ? (suggestedAmountCents / 100).toFixed(2) : "",
  );
  // ACH bank details (presentation-only form state — not sent to the gateway).
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [bankName, setBankName] = useState("");
  // Bitcoin crypto-wallet details (presentation-only form state).
  const [walletAddress, setWalletAddress] = useState("");
  // Stable across re-renders of this form instance. A retried submit
  // (e.g. user double-clicks "Collect payment") reuses the same key, so
  // the server short-circuits and returns the existing payment id.
  const idempotencyKey = useMemo(() => generateIdempotencyKey(), []);

  if (state?.ok) {
    return (
      <div className="text-center py-3">
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
          Payment recorded
        </div>
        <p className="text-xs text-text-muted mt-3">
          Refresh to see the updated balance.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3 @container">
      <input type="hidden" name="patientId" value={patientId} />
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

      {/* Amount input */}
      <div>
        <label className="text-[10px] font-medium uppercase tracking-wider text-text-subtle block mb-1">
          Amount
        </label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            $
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full pl-7 pr-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50 tabular-nums"
          />
          <input
            type="hidden"
            name="amountCents"
            value={Math.round((parseFloat(amount) || 0) * 100)}
          />
        </div>
      </div>

      {/* Method selector */}
      <div>
        <label className="text-[10px] font-medium uppercase tracking-wider text-text-subtle block mb-1.5">
          Method
        </label>
        <div className="grid grid-cols-3 @xs:grid-cols-5 gap-1">
          {(["card", "ach", "cash", "check", "bitcoin"] as Method[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMethod(m)}
              className={`text-[11px] py-1.5 rounded-md transition-all capitalize ${
                method === m
                  ? "bg-accent text-accent-ink shadow-sm"
                  : "bg-surface-muted text-text-muted hover:bg-surface border border-border"
              }`}
            >
              {m}
            </button>
          ))}
        </div>
        {/* Submit a server-valid enum value (bitcoin maps to cash). */}
        <input type="hidden" name="method" value={serverMethod(method)} />
      </div>

      {/* Card-on-file note */}
      {method === "card" && hasCardOnFile && cardLast4 && (
        <p className="text-[11px] text-text-subtle">
          Will use {cardBrand} •{cardLast4} on file
        </p>
      )}
      {method === "card" && !hasCardOnFile && (
        <p className="text-[11px] text-[color:var(--warning)]">
          No card on file — will prompt patient to enter
        </p>
      )}

      {/* ACH bank details — UI form fields only, not sent to the gateway */}
      {method === "ach" && (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-text-subtle block mb-1">
              Routing number
            </label>
            <input
              type="text"
              inputMode="numeric"
              name="achRoutingNumber"
              value={routingNumber}
              onChange={(e) => setRoutingNumber(e.target.value)}
              placeholder="123456789"
              className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50 tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-text-subtle block mb-1">
              Account number
            </label>
            <input
              type="text"
              inputMode="numeric"
              name="achAccountNumber"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="000123456789"
              className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50 tabular-nums"
            />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-text-subtle block mb-1">
              Bank name
            </label>
            <input
              type="text"
              name="achBankName"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="First National Bank"
              className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
            />
          </div>
        </div>
      )}

      {/* Bitcoin crypto-wallet details — UI form fields only, no crypto rails */}
      {method === "bitcoin" && (
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-text-subtle block mb-1">
            Crypto wallet address
          </label>
          <input
            type="text"
            name="bitcoinWalletAddress"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="bc1q…"
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text font-mono focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent/50"
          />
          <p className="text-[11px] text-text-subtle mt-1">
            Recorded for documentation — settlement is handled off-platform.
          </p>
        </div>
      )}

      {/* Reference */}
      {(method === "check" || method === "cash") && (
        <div>
          <label className="text-[10px] font-medium uppercase tracking-wider text-text-subtle block mb-1">
            {method === "check" ? "Check #" : "Reference"}
          </label>
          <input
            type="text"
            name="reference"
            placeholder={method === "check" ? "1234" : "Receipt #"}
            className="w-full px-3 py-2 rounded-md border border-border bg-surface text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      )}

      {state?.ok === false && (
        <p className="text-xs text-danger">{state.error}</p>
      )}

      <SubmitButton disabled={!amount || parseFloat(amount) <= 0} />

      {suggestedAmountCents === 0 && (
        <p className="text-[11px] text-text-subtle text-center">
          No balance due — overpayment will create a credit.
        </p>
      )}
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      size="sm"
      className="w-full"
      disabled={pending || disabled}
    >
      {pending ? "Recording..." : "Collect payment"}
    </Button>
  );
}
