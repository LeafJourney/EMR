"use client";

import * as React from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { recordAssessmentQuickEntry, type QuickEntryResult } from "./actions";
import { useToast } from "@/components/ui/toast";

// EMR-160 — quick-entry form, the "I'm in clinic with the paper form" flow.
//
// The clinician types: instrument, total score, optional one-liner. We
// link to the active encounter when there is one so the score threads
// into the visit timeline. Validation lives in the server action; this
// form only enforces presence.

interface InstrumentOption {
  slug: string;
  title: string;
  range: { min: number; max: number };
}

export function QuickEntryForm({
  patientId,
  encounterOptions,
  instruments,
  defaultEncounterId,
}: {
  patientId: string;
  encounterOptions: { id: string; label: string }[];
  instruments: InstrumentOption[];
  defaultEncounterId?: string;
}) {
  const [state, action] = useFormState<QuickEntryResult | null, FormData>(
    recordAssessmentQuickEntry,
    null,
  );
  const [slug, setSlug] = React.useState(instruments[0]?.slug ?? "");
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const selected = instruments.find((i) => i.slug === slug);
  const { toast } = useToast();

  React.useEffect(() => {
    if (!state) return;
    if (state.ok && formRef.current) {
      formRef.current.reset();
      // Restore the slug since reset() clears the controlled select too.
      setSlug(instruments[0]?.slug ?? "");
      toast({
        title: "Assessment recorded",
        description: state.label,
        variant: "success",
      });
    } else if (!state.ok) {
      toast({
        title: "Couldn't record assessment",
        description: state.error,
        variant: "error",
      });
    }
  }, [state, instruments, toast]);

  return (
    <form
      ref={formRef}
      action={action}
      className="grid gap-3 md:grid-cols-[1fr,140px,1fr,auto] items-end"
    >
      <input type="hidden" name="patientId" value={patientId} />

      <Field label="Instrument">
        <select
          name="slug"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className="h-10 w-full rounded-md border border-border-strong/70 bg-surface px-3 text-sm text-text"
        >
          {instruments.map((i) => (
            <option key={i.slug} value={i.slug}>
              {i.title}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label={
          selected
            ? `Score (${selected.range.min}–${selected.range.max})`
            : "Score"
        }
      >
        <Input
          type="number"
          name="score"
          step="0.1"
          min={selected?.range.min}
          max={selected?.range.max}
          required
          aria-label="Score"
        />
      </Field>

      <Field label="Visit (optional)">
        <select
          name="encounterId"
          defaultValue={defaultEncounterId ?? ""}
          className="h-10 w-full rounded-md border border-border-strong/70 bg-surface px-3 text-sm text-text"
        >
          <option value="">Not linked</option>
          {encounterOptions.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </select>
      </Field>

      <SubmitButton />

      <div className="md:col-span-4">
        <Field label="Note (optional)">
          <Input
            type="text"
            name="note"
            placeholder="e.g. paper form during rooming, patient declined item 9"
            maxLength={1000}
          />
        </Field>
      </div>

    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="md" disabled={pending}>
      {pending ? "Saving…" : "Record"}
    </Button>
  );
}
