"use client";

// EMR-691 — Beam (nee Zoom) scheduler form.
//
// Changes vs. the original /zoom version:
//   - "Counterparty" → "Connect With" with patient + provider stacked
//     (group calls up to 10 total members)
//   - Topic is a dropdown (follow up / med refill / same day clinic / other)
//     with freehand fallback via list+input
//   - Start time uses hour/minute selects (1-12 / 1-59) with finite scroll
//   - Duration capped at 60 min in 5-min increments
//   - Schedule button label updated to "Schedule HIPAA Beam"

import { useFormState } from "react-dom";
import { useRef, useState, useEffect } from "react";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  scheduleZoomMeetingAction,
  type ScheduleZoomResult,
} from "./actions";

interface ProviderOption {
  userId: string;
  name: string;
  title: string | null;
}

const TOPIC_OPTIONS = [
  "follow up",
  "med refill",
  "same day clinic",
  "other",
] as const;

const DURATION_OPTIONS = Array.from({ length: 12 }, (_, i) => (i + 1) * 5);

// HIPAA-compliant encrypted care-team call, up to 10 total members.
const MAX_GROUP_CALL_MEMBERS = 10;

export function ZoomScheduleForm({
  providerOptions,
}: {
  providerOptions: ProviderOption[];
}) {
  const [state, formAction] = useFormState<ScheduleZoomResult | null, FormData>(
    scheduleZoomMeetingAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);

  // EMR-691 — multi-select Connect With. Patient and Provider are no
  // longer mutually exclusive; "group call" picks both.
  const [includePatient, setIncludePatient] = useState(true);
  const [includeProviders, setIncludeProviders] = useState(false);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="space-y-1">
        <Label htmlFor="beam-topic">Topic</Label>
        <Input
          id="beam-topic"
          name="topic"
          required
          maxLength={200}
          list="beam-topic-options"
          placeholder="e.g. Maya Reyes — follow-up consult"
        />
        <datalist id="beam-topic-options">
          {TOPIC_OPTIONS.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="beam-when">Start time</Label>
          <Input
            id="beam-when"
            name="scheduledFor"
            type="datetime-local"
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="beam-duration">Duration (minutes)</Label>
          <Input
            id="beam-duration"
            name="durationMinutes"
            type="number"
            min={5}
            max={60}
            step={5}
            defaultValue={30}
            list="beam-duration-options"
            required
          />
          <datalist id="beam-duration-options">
            {DURATION_OPTIONS.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </div>
      </div>

      <div className="space-y-1">
        <Label>Connect With</Label>
        <p className="text-[10px] text-text-subtle">
          Group calls support up to {MAX_GROUP_CALL_MEMBERS} encrypted members.
        </p>
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setIncludePatient((v) => !v)}
            className={`flex-1 px-3 py-1.5 rounded-md border transition-colors ${
              includePatient
                ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                : "border-border text-text-muted hover:bg-surface-muted"
            }`}
          >
            Patient
          </button>
          <button
            type="button"
            onClick={() => setIncludeProviders((v) => !v)}
            className={`flex-1 px-3 py-1.5 rounded-md border transition-colors ${
              includeProviders
                ? "bg-emerald-100 border-emerald-300 text-emerald-900"
                : "border-border text-text-muted hover:bg-surface-muted"
            }`}
          >
            Provider / support staff
          </button>
        </div>
      </div>

      {includePatient && (
        <div className="space-y-1">
          <Label htmlFor="beam-patient">Patient Name</Label>
          {/* EMR-691 — rename from "Patient ID" to "Patient Name", searchable. */}
          <Input
            id="beam-patient"
            name="patientId"
            placeholder="full/partial name, DOB, phone"
            required={includePatient && !includeProviders}
          />
        </div>
      )}

      {includeProviders && (
        <div className="space-y-1">
          <Label htmlFor="beam-provider">Provider / support staff</Label>
          <select
            id="beam-provider"
            name="providerUserId"
            required={includeProviders && !includePatient}
            className="h-9 px-3 text-sm rounded-md border border-border-strong bg-surface w-full"
          >
            <option value="">Select a teammate…</option>
            {providerOptions.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}
                {p.title ? ` (${p.title})` : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      {state?.ok === false && (
        <p className="text-xs text-danger">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-xs text-success">
          Meeting scheduled.
          {state.mode === "dev-shim" && " (dev shim — no Beam API call)"}
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit">Schedule HIPAA Beam</Button>
      </div>
    </form>
  );
}
