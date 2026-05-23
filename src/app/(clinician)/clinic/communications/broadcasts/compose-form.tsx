"use client";

// EMR-707 — Broadcasts compose form.
//
// Adds patient-list builder + Custom audience, SMS+Text dual channel,
// Frequency cadence, and End Campaign cutoff. The list builder emits
// a stable patient ID array we ship to the action as a hidden field
// (JSON), which the action stores in `audienceFilter.customPatientIds`.

import { useFormState } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createCampaignAction, type CampaignResult } from "./actions";
import {
  PatientListBuilder,
  type ListPatient,
} from "./patient-list-builder";

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 59 }, (_, i) => String(i + 1));

export function CampaignComposeForm() {
  const [state, formAction] = useFormState<CampaignResult | null, FormData>(
    createCampaignAction,
    null,
  );
  const formRef = useRef<HTMLFormElement>(null);
  const [listPatients, setListPatients] = useState<ListPatient[]>([]);
  const [audience, setAudience] = useState<"active" | "all" | "custom">(
    "active",
  );
  const customIdsJson = useMemo(
    () => JSON.stringify(listPatients.map((p) => p.id)),
    [listPatients],
  );

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setListPatients([]);
      setAudience("active");
    }
  }, [state]);

  const customLabel =
    listPatients.length > 0
      ? `Custom — ${listPatients.length} patients`
      : "Custom";

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <PatientListBuilder
          patients={listPatients}
          onChange={setListPatients}
        />
      </div>

      <input type="hidden" name="customPatientIds" value={customIdsJson} />

      <div className="space-y-1">
        <Label htmlFor="campaign-name">Campaign name</Label>
        <Input
          id="campaign-name"
          name="name"
          required
          maxLength={120}
          placeholder="e.g. Refill reminder — May"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="channel">Channel</Label>
          <select
            id="channel"
            name="channel"
            required
            className="h-9 px-3 text-sm rounded-md border border-border-strong bg-surface w-full"
          >
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="sms_text">SMS and Text</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="audienceStatus">Audience</Label>
          <select
            id="audienceStatus"
            name="audienceStatus"
            value={audience}
            onChange={(e) =>
              setAudience(e.target.value as "active" | "all" | "custom")
            }
            className="h-9 px-3 text-sm rounded-md border border-border-strong bg-surface w-full"
          >
            <option value="active">Active patients</option>
            <option value="all">All patients</option>
            <option value="custom">{customLabel}</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-text-muted">
        <input type="checkbox" name="audienceQualified" className="h-4 w-4" />
        Restrict to qualified patients only
      </label>

      <div className="space-y-1">
        <Label htmlFor="bodyTemplate">Message body</Label>
        <Textarea
          id="bodyTemplate"
          name="bodyTemplate"
          required
          rows={5}
          maxLength={1000}
          defaultValue="Hi {{firstName}}, just a reminder, "
          placeholder={"Hi {{firstName}}, just a reminder…"}
        />
        <p className="text-[10px] text-text-subtle">
          Supports <code>{`{{firstName}}`}</code> and{" "}
          <code>{`{{lastName}}`}</code>. Max 1000 chars.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="scheduledFor">Schedule for (optional)</Label>
          <Input id="scheduledFor" name="scheduledFor" type="datetime-local" />
          <div className="flex gap-2 mt-1">
            <select
              name="scheduledHour"
              defaultValue=""
              size={1}
              className="h-8 px-2 text-xs rounded-md border border-border-strong bg-surface"
            >
              <option value="">HH</option>
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <select
              name="scheduledMinute"
              defaultValue=""
              size={1}
              className="h-8 px-2 text-xs rounded-md border border-border-strong bg-surface"
            >
              <option value="">MM</option>
              {MINUTES.map((m) => (
                <option key={m} value={m}>
                  {m.padStart(2, "0")}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="frequency">Frequency (optional)</Label>
          <Input
            id="frequency"
            name="frequency"
            placeholder="once per week"
            list="frequency-options"
            maxLength={60}
          />
          <datalist id="frequency-options">
            <option value="once per day" />
            <option value="twice per day" />
            <option value="once per week" />
            <option value="once per month" />
          </datalist>
          <p className="text-[10px] text-text-subtle">
            Max twice per day.
          </p>
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="endCampaignAt">End Campaign (optional)</Label>
        <Input id="endCampaignAt" name="endCampaignAt" type="datetime-local" />
        <p className="text-[10px] text-text-subtle">
          Cutoff when the campaign automatically stops sending.
        </p>
      </div>

      <label className="flex items-center gap-2 text-xs text-text-muted">
        <input type="checkbox" name="sendNow" className="h-4 w-4" />
        Send immediately (skip schedule)
      </label>

      {state?.ok === false && (
        <p className="text-xs text-danger">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-xs text-success">
          Campaign created — {state.recipientCount} recipients.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit">Create campaign</Button>
      </div>
    </form>
  );
}
