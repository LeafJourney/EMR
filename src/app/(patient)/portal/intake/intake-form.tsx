"use client";

import Link from "next/link";
import { useFormState } from "react-dom";
import { saveIntakeAction, type IntakeResult } from "./actions";
import { Input, Textarea, FieldGroup } from "@/components/ui/input";
import { SubmitButton } from "@/lib/ui/form-helpers";

interface InitialValues {
  presentingConcerns: string;
  treatmentGoals: string;
  priorUse: boolean;
  formats: string;
  reportedBenefits: string;
}

export function IntakeForm({
  initial,
  registrationComplete = true,
}: {
  initial: InitialValues;
  /** Drives the "what happens next" panel after save (EMR-1114 / PJ-2). */
  registrationComplete?: boolean;
}) {
  const [state, formAction] = useFormState<IntakeResult | null, FormData>(
    saveIntakeAction,
    null
  );

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
          defaultValue={initial.presentingConcerns}
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
          defaultValue={initial.treatmentGoals}
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
              defaultChecked={initial.priorUse}
              className="h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/20"
            />
            <span className="text-sm text-text">I have used cannabis before</span>
          </label>

          <FieldGroup
            label="Formats you've used"
            htmlFor="formats"
            hint="Comma-separated. Flower, vape, tincture, edible, topical…"
          >
            <Input
              id="formats"
              name="formats"
              defaultValue={initial.formats}
              placeholder="flower, tincture"
            />
          </FieldGroup>

          <FieldGroup
            label="What helped (if anything)?"
            htmlFor="reportedBenefits"
            hint="Optional. What you'd want to happen again."
          >
            <Input
              id="reportedBenefits"
              name="reportedBenefits"
              defaultValue={initial.reportedBenefits}
              placeholder="sleep onset, reduced pain"
            />
          </FieldGroup>
        </div>
      </div>

      {state?.ok === false && (
        <p className="text-sm text-danger">{state.error}</p>
      )}

      {state?.ok && (
        <div className="p-4 rounded-lg bg-emerald-50/60 border border-emerald-200/60">
          <p className="text-sm font-medium text-emerald-800 mb-2">
            Saved — your chart summary has been updated.
          </p>
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2">
            What happens next
          </p>
          <ul className="text-sm text-emerald-900/90 space-y-1.5 list-disc pl-5">
            <li>
              Your care team reviews your intake before your visit, so the
              time is spent on what matters to you.
            </li>
            <li>
              <Link
                href="/portal/schedule"
                className="font-medium underline underline-offset-2 hover:text-emerald-700"
              >
                Book a visit
              </Link>{" "}
              — pick a time that works for you.
            </li>
            {!registrationComplete && (
              <li>
                <Link
                  href="/portal/registration"
                  className="font-medium underline underline-offset-2 hover:text-emerald-700"
                >
                  Finish registration
                </Link>{" "}
                — contact, insurance and consents take just a couple of
                minutes.
              </li>
            )}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <SubmitButton idleLabel="Save intake" pendingLabel="Saving intake…" />
      </div>
    </form>
  );
}
