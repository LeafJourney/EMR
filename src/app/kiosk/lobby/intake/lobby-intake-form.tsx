"use client";

import { useFormState } from "react-dom";
import Link from "next/link";
import { Input, Textarea, FieldGroup } from "@/components/ui/input";
import { SubmitButton } from "@/lib/ui/form-helpers";
import { lobbySubmitIntake, type LobbySubmitResult } from "../actions";

/**
 * Phone-friendly adaptation of the portal IntakeForm. Same fields (presenting
 * concerns, goals, cannabis history) but it STAGES the data for staff review
 * via lobbySubmitIntake rather than writing the chart, and the action re-derives
 * the patient from the lobby session (no client patientId).
 */
export function LobbyIntakeForm() {
  const [state, formAction] = useFormState<LobbySubmitResult | null, FormData>(
    lobbySubmitIntake,
    null,
  );

  if (state?.ok) {
    return (
      <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/50 px-6 py-8 text-center">
        <div className="text-4xl mb-3" aria-hidden="true">
          ✅
        </div>
        <h2 className="font-display text-xl text-text tracking-tight mb-2">Got it — thank you</h2>
        <p className="text-sm text-text-muted leading-relaxed mb-6">
          Your care team will review this before your visit.
        </p>
        <Link
          href="/kiosk/lobby"
          className="inline-flex items-center justify-center rounded-full bg-accent text-accent-ink px-6 py-3 text-sm font-medium"
        >
          Back to my check-in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5">
      <FieldGroup
        label="What brings you in?"
        htmlFor="presentingConcerns"
        hint="A sentence or two is plenty."
      >
        <Textarea
          id="presentingConcerns"
          name="presentingConcerns"
          rows={3}
          placeholder="e.g. chronic pain, trouble sleeping, anxiety…"
        />
      </FieldGroup>

      <FieldGroup
        label="What would you like to get out of care?"
        htmlFor="treatmentGoals"
        hint="Goals help us measure what's working."
      >
        <Textarea
          id="treatmentGoals"
          name="treatmentGoals"
          rows={3}
          placeholder="e.g. sleep through the night, reduce pain enough to walk every day…"
        />
      </FieldGroup>

      <div className="pt-4 border-t border-border">
        <h3 className="text-sm font-semibold text-text mb-3">Cannabis history</h3>
        <div className="space-y-4">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="priorUse"
              className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/20"
            />
            <span className="text-sm text-text">I have used cannabis before</span>
          </label>

          <FieldGroup
            label="Formats you've used"
            htmlFor="formats"
            hint="Comma-separated. Flower, vape, tincture, edible, topical…"
          >
            <Input id="formats" name="formats" placeholder="flower, tincture" />
          </FieldGroup>

          <FieldGroup
            label="What helped (if anything)?"
            htmlFor="reportedBenefits"
            hint="Optional. What you'd want to happen again."
          >
            <Input id="reportedBenefits" name="reportedBenefits" placeholder="sleep onset, reduced pain" />
          </FieldGroup>
        </div>
      </div>

      {state?.ok === false && <p className="text-sm text-danger">{state.error}</p>}

      <SubmitButton idleLabel="Submit" pendingLabel="Submitting…" className="w-full" />
    </form>
  );
}
