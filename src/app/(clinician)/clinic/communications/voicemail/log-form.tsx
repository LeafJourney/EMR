"use client";

import { useFormState } from "react-dom";
import { useRef, useEffect } from "react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  recordVoicemailAction,
  type RecordVoicemailResult,
} from "./actions";

interface Teammate {
  id: string;
  name: string;
}

export function LogVoicemailForm({ teammates }: { teammates: Teammate[] }) {
  const [state, formAction] = useFormState<
    RecordVoicemailResult | null,
    FormData
  >(recordVoicemailAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <div className="space-y-1">
        <Label htmlFor="vm-from">From</Label>
        <Input
          id="vm-from"
          name="fromNumber"
          required
          placeholder="+1 555-555-1234"
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          {/* EMR-692 — dropdown of 5s steps to 60s, then 1m → 3m in 5s steps.
              Freehand entry still allowed via the underlying number input. */}
          <Label htmlFor="vm-duration">Duration</Label>
          <Input
            id="vm-duration"
            name="durationSeconds"
            type="number"
            min={1}
            max={1800}
            list="vm-duration-options"
            placeholder="45"
          />
          <datalist id="vm-duration-options">
            {Array.from({ length: 11 }, (_, i) => (i + 1) * 5).map((s) => (
              <option key={`s-${s}`} value={s}>
                {s}s
              </option>
            ))}
            {Array.from({ length: 24 }, (_, i) => 60 + i * 5).map((s) => {
              const min = Math.floor(s / 60);
              const sec = s % 60;
              const label = sec === 0 ? `${min}m` : `${min}m ${sec}s`;
              return (
                <option key={`m-${s}`} value={s}>
                  {label}
                </option>
              );
            })}
          </datalist>
        </div>
        <div className="space-y-1">
          {/* EMR-692 — was "Patient ID"; now "Patient Info" + searchable. */}
          <Label htmlFor="vm-patient">Patient Info</Label>
          <Input
            id="vm-patient"
            name="patientId"
            placeholder="phone, DOB, full last/first name, medical life #"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="vm-audio">Audio storage key</Label>
        <Input
          id="vm-audio"
          name="audioStorageKey"
          placeholder="s3://voicemails/2026/04/…"
        />
        <p className="text-[10px] text-text-subtle">
          LeafJourney does not store audio for more than 30 days; all
          servers auto-delete recordings on the 30-day anniversary.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="vm-transcript">Raw transcript</Label>
        <Textarea
          id="vm-transcript"
          name="rawTranscript"
          rows={4}
          maxLength={20000}
          placeholder="Paste the recording transcript — PHI will be removed before saving."
        />
        {/* EMR-692 — copy reword to plain language. */}
        <p className="text-[10px] text-text-subtle">
          The front desk removes private health information from the notes
          before saving so no personal information is stored in the EMR.
        </p>
      </div>
      <div className="space-y-1">
        {/* EMR-692 — Assign-to is now required (no Unassigned option). */}
        <Label htmlFor="vm-assign">Assign to</Label>
        <select
          id="vm-assign"
          name="assignedToUserId"
          required
          defaultValue=""
          className="h-9 px-3 text-sm rounded-md border border-border-strong bg-surface w-full"
        >
          <option value="" disabled>
            Select a teammate…
          </option>
          {teammates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      {state?.ok === false && (
        <p className="text-xs text-danger">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-xs text-success">Voicemail logged.</p>
      )}

      <div className="flex justify-end">
        <Button type="submit">Log voicemail</Button>
      </div>
    </form>
  );
}
