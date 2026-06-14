"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DictationTextarea } from "@/components/ui/dictation-input";
import {
  discardDraft,
  getCheckoutQueue,
  signSpokenIntentOrders,
  stageSpokenIntent,
  type CheckoutDraft,
} from "./spoken-intent-actions";
import type { DraftOrder } from "@/lib/clinical/spoken-intent/types";

const EXAMPLE =
  "e.g. Let's check your fasting insulin and NMR lipoprofile next week, and start a 14:10 intermittent fasting schedule";

// EMR-1157 — spoken-intent order drafting. The provider dictates or types a
// directive; specific targets stage silently as draft orders (soft-hue,
// Zen-Density); "Authorize & Sign" is the only thing that transmits anything.
export function SpokenIntentCheckout({
  patientId,
  encounterId = null,
}: {
  patientId: string;
  encounterId?: string | null;
}) {
  const [utterance, setUtterance] = React.useState("");
  const [drafts, setDrafts] = React.useState<CheckoutDraft[]>([]);
  const [lowConfidence, setLowConfidence] = React.useState<DraftOrder[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [signedCount, setSignedCount] = React.useState(0);
  const [drafting, startDrafting] = React.useTransition();
  const [signing, startSigning] = React.useTransition();

  React.useEffect(() => {
    let active = true;
    getCheckoutQueue(patientId, encounterId).then((res) => {
      if (active && res.ok) setDrafts(res.drafts);
    });
    return () => {
      active = false;
    };
  }, [patientId, encounterId]);

  function draft() {
    if (!utterance.trim()) return;
    setError(null);
    setSignedCount(0);
    startDrafting(async () => {
      const res = await stageSpokenIntent({ patientId, encounterId, utterance });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDrafts((cur) => {
        const seen = new Set(cur.map((d) => d.id));
        return [...cur, ...res.staged.filter((d) => !seen.has(d.id))];
      });
      setLowConfidence(res.lowConfidence);
      setUtterance("");
    });
  }

  function sign() {
    if (drafts.length === 0) return;
    setError(null);
    const ids = drafts.map((d) => d.id);
    startSigning(async () => {
      const res = await signSpokenIntentOrders(ids);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSignedCount(res.signed);
      setDrafts([]);
      setLowConfidence([]);
    });
  }

  function remove(id: string) {
    startDrafting(async () => {
      const res = await discardDraft(id);
      if (res.ok) setDrafts((cur) => cur.filter((d) => d.id !== id));
      else setError(res.error);
    });
  }

  return (
    <section
      aria-labelledby="spoken-intent-heading"
      className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm"
    >
      <div className="border-b border-border/70 bg-surface-muted/60 px-5 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Spoken-intent drafting
        </p>
        <h2 id="spoken-intent-heading" className="mt-1 font-display text-xl font-semibold tracking-tight text-text">
          Say it; we'll draft the orders
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Dictate or type what you want. Labs and lifestyle plans stage as drafts below — nothing
          is sent until you Authorize &amp; Sign.
        </p>
      </div>

      <div className="space-y-4 px-5 py-5">
        <div className="space-y-2">
          <DictationTextarea
            value={utterance}
            onChange={setUtterance}
            rows={3}
            placeholder={EXAMPLE}
            aria-label="Order directive"
            className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text shadow-sm outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-text-subtle">
              Tap the mic to dictate, or type the directive.
            </span>
            <Button type="button" size="sm" variant="secondary" onClick={draft} disabled={drafting || !utterance.trim()}>
              {drafting ? "Drafting…" : "Draft orders"}
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-danger/30 bg-red-50/40 px-4 py-2.5 text-sm text-danger">
            {error}
          </div>
        )}

        {signedCount > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-2.5 text-sm font-medium text-emerald-700">
            ✓ Signed {signedCount} order{signedCount === 1 ? "" : "s"} — labs routed to the diagnostic
            center; lifestyle plans sent to the patient app.
          </div>
        )}

        {drafts.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
              Checkout queue · {drafts.length} draft{drafts.length === 1 ? "" : "s"}
            </p>
            <ul className="space-y-2">
              {drafts.map((d) => (
                <li
                  key={d.id}
                  className="flex items-start gap-3 rounded-lg border border-accent/20 bg-accent-soft/30 px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-text">{d.name}</span>
                      <Badge tone={d.resourceType === "CarePlan" ? "accent" : "neutral"}>
                        {d.resourceType === "CarePlan" ? "Lifestyle" : "Lab"}
                      </Badge>
                      <Badge tone="neutral">
                        {d.code.system} {d.code.code}
                      </Badge>
                      {d.occurrenceLabel && (
                        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-text-muted">
                          🗓 {d.occurrenceLabel}
                        </span>
                      )}
                      {d.detail && (
                        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-text-muted">
                          {d.detail}
                        </span>
                      )}
                    </div>
                    {d.fastingInstruction && (
                      <p className="mt-1 text-xs text-text-muted">🚰 {d.fastingInstruction}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(d.id)}
                    disabled={drafting}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-text-subtle hover:bg-surface hover:text-danger"
                    aria-label={`Remove ${d.name}`}
                    title="Remove from checkout"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {lowConfidence.length > 0 && (
          <div className="rounded-lg border border-highlight/30 bg-highlight-soft px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
              Needs a clearer name — not staged
            </p>
            <ul className="mt-1 space-y-0.5 text-sm text-text-muted">
              {lowConfidence.map((d, i) => (
                <li key={i}>
                  “{d.raw}” → did you mean <span className="font-medium text-text">{d.name}</span>? Say it
                  more specifically to stage it.
                </li>
              ))}
            </ul>
          </div>
        )}

        {drafts.length > 0 && (
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-4">
            <p className="text-xs text-text-muted">
              Drafts stay private until you sign. Signing transmits labs and notifies the patient.
            </p>
            <Button type="button" size="sm" variant="primary" onClick={sign} disabled={signing}>
              {signing ? "Signing…" : `Authorize & Sign (${drafts.length})`}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
