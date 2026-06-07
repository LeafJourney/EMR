"use client";

/**
 * EMR-211 — Multi-channel reminder preferences (INTERIM, localStorage-backed).
 *
 * Practice-level defaults for appointment reminders: which channels are on
 * (SMS / email / push), the patient's preferred confirmation channel, the
 * timezone, and quiet hours during which we never send SMS/push. A live
 * preview runs the real reminder engine (`@/lib/scheduling/reminders`) against
 * a sample upcoming visit so staff can see exactly what would fire.
 *
 * Interim notice: prefs persist to this browser's localStorage only (no schema
 * change). A production rollout moves these to a per-organization settings row
 * and feeds buildReminderPlan() output onto the AgentJob queue.
 */

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  buildReminderPlan,
  type ChannelPrefs,
  type ReminderChannel,
} from "@/lib/scheduling/reminders";
import type { RiskTier } from "@/lib/scheduling/no-show-model";

const LABEL_CLASS =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle mb-1.5";
const INPUT_CLASS =
  "flex w-full rounded-xl border border-border-strong bg-white px-3 h-11 text-sm text-text " +
  "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

function storageKey(orgId: string) {
  return `reminder-prefs:${orgId}:v1`;
}

const DEFAULT_PREFS: ChannelPrefs = {
  smsOptIn: true,
  emailOptIn: true,
  pushOptIn: true,
  quietHours: { startHour: 21, endHour: 8 },
  timezone: "America/Los_Angeles",
  preferredChannel: "sms",
};

const CHANNEL_LABEL: Record<ReminderChannel, string> = {
  sms: "SMS",
  email: "Email",
  push: "Push",
  voice_call: "Live call",
};

const TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
];

export function ReminderPreferencesForm({ organizationId }: { organizationId: string }) {
  const key = storageKey(organizationId);
  const [prefs, setPrefs] = useState<ChannelPrefs>(DEFAULT_PREFS);
  const [quietEnabled, setQuietEnabled] = useState(true);
  const [previewTier, setPreviewTier] = useState<RiskTier>("medium");
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as ChannelPrefs;
        setPrefs({ ...DEFAULT_PREFS, ...parsed });
        setQuietEnabled(parsed.quietHours !== null);
      }
    } catch {
      /* corrupt / private mode — keep defaults */
    }
  }, [key]);

  function update<K extends keyof ChannelPrefs>(field: K, value: ChannelPrefs[K]) {
    setPrefs((p) => ({ ...p, [field]: value }));
  }

  function save() {
    const payload: ChannelPrefs = {
      ...prefs,
      quietHours: quietEnabled ? prefs.quietHours ?? { startHour: 21, endHour: 8 } : null,
    };
    try {
      window.localStorage.setItem(key, JSON.stringify(payload));
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch {
      /* quota / private mode — non-fatal */
    }
  }

  // Live preview — run the real engine against a sample visit 7 days out.
  const preview = useMemo(() => {
    const effective: ChannelPrefs = {
      ...prefs,
      quietHours: quietEnabled ? prefs.quietHours ?? { startHour: 21, endHour: 8 } : null,
    };
    const startAt = new Date(Date.now() + 7 * 86_400_000);
    return buildReminderPlan({
      appointmentId: "preview",
      patientId: "preview",
      startAt,
      riskTier: previewTier,
      prefs: effective,
      bookedAt: new Date(),
      preConfirmed: false,
    }).sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime());
  }, [prefs, quietEnabled, previewTier]);

  const quiet = prefs.quietHours ?? { startHour: 21, endHour: 8 };

  return (
    <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Appointment reminders
          {justSaved && <Badge tone="success" className="text-[10px]">Saved ✓</Badge>}
        </CardTitle>
        <CardDescription>
          Channels, preferred confirmation channel, and quiet hours for automated
          visit reminders. Higher no-show risk adds extra touches automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Channel toggles */}
        <div>
          <span className={LABEL_CLASS}>Channels</span>
          <div className="flex flex-wrap gap-2">
            <ChannelToggle label="SMS" on={prefs.smsOptIn} onClick={() => update("smsOptIn", !prefs.smsOptIn)} />
            <ChannelToggle label="Email" on={prefs.emailOptIn} onClick={() => update("emailOptIn", !prefs.emailOptIn)} />
            <ChannelToggle label="Push" on={prefs.pushOptIn} onClick={() => update("pushOptIn", !prefs.pushOptIn)} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={LABEL_CLASS} htmlFor="rem-pref-channel">Preferred channel</label>
            <select
              id="rem-pref-channel"
              value={prefs.preferredChannel}
              onChange={(e) => update("preferredChannel", e.target.value as ChannelPrefs["preferredChannel"])}
              className={INPUT_CLASS}
            >
              <option value="sms">SMS</option>
              <option value="email">Email</option>
              <option value="push">Push</option>
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="rem-tz">Timezone</label>
            <select
              id="rem-tz"
              value={prefs.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              className={INPUT_CLASS}
            >
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz.replace("America/", "").replace("_", " ")}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Quiet hours */}
        <div className="rounded-xl border border-border/60 bg-surface-muted/40 px-3 py-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={quietEnabled}
              onChange={(e) => setQuietEnabled(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--accent)]"
            />
            <span className="text-sm font-medium text-text">Quiet hours (no SMS/push)</span>
          </label>
          {quietEnabled && (
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <label className={LABEL_CLASS} htmlFor="rem-quiet-start">From</label>
                <select
                  id="rem-quiet-start"
                  value={quiet.startHour}
                  onChange={(e) => update("quietHours", { ...quiet, startHour: Number(e.target.value) })}
                  className={INPUT_CLASS}
                >
                  {hourOptions()}
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS} htmlFor="rem-quiet-end">Until</label>
                <select
                  id="rem-quiet-end"
                  value={quiet.endHour}
                  onChange={(e) => update("quietHours", { ...quiet, endHour: Number(e.target.value) })}
                  className={INPUT_CLASS}
                >
                  {hourOptions()}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-border/60 px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className={LABEL_CLASS + " mb-0"}>Preview timeline</span>
            <div className="flex gap-1">
              {(["low", "medium", "high"] as RiskTier[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setPreviewTier(t)}
                  className={
                    "text-[10px] px-2 py-0.5 rounded-full border " +
                    (previewTier === t
                      ? "border-accent/60 bg-accent/10 text-accent"
                      : "border-border text-text-muted")
                  }
                >
                  {t} risk
                </button>
              ))}
            </div>
          </div>
          {preview.length === 0 ? (
            <p className="text-[11px] text-text-subtle italic py-2">
              No reminders would send — all matching channels are off.
            </p>
          ) : (
            <ul className="space-y-1">
              {preview.map((job) => (
                <li key={job.jobKey} className="flex items-center gap-2 text-[12px]">
                  <Badge tone="neutral" className="text-[9px] w-14 justify-center shrink-0">
                    {CHANNEL_LABEL[job.channel]}
                  </Badge>
                  <span className="text-text-muted tabular-nums">{offsetLabel(job.offsetHours)}</span>
                  <span className="text-text-subtle">·</span>
                  <span className="text-text-subtle">{job.template.replace(/_/g, " ")}</span>
                  {job.expectsResponse && (
                    <Badge tone="accent" className="text-[9px]">confirm</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" onClick={save}>
            {justSaved ? "Saved ✓" : "Save reminder settings"}
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-text-subtle rounded-lg bg-surface-muted/60 border border-border/60 px-3 py-2">
          <span className="font-semibold">Interim storage notice:</span> these
          preferences save to this browser&apos;s localStorage only (no schema
          change). Production wires them to a per-organization settings row and
          enqueues the previewed jobs onto the reminder workers.
        </p>
      </CardContent>
    </Card>
  );
}

function ChannelToggle({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={
        "text-xs px-3 py-1.5 rounded-full border transition-colors " +
        (on
          ? "border-accent/50 bg-accent/10 text-accent font-medium"
          : "border-border text-text-muted hover:border-border-strong")
      }
    >
      {on ? "● " : "○ "}
      {label}
    </button>
  );
}

function hourOptions() {
  return Array.from({ length: 24 }, (_, h) => (
    <option key={h} value={h}>
      {h === 0 ? "12 AM" : h < 12 ? `${h} AM` : h === 12 ? "12 PM" : `${h - 12} PM`}
    </option>
  ));
}

function offsetLabel(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min before`;
  if (hours < 24) return `${hours}h before`;
  const days = hours / 24;
  return `${days % 1 === 0 ? days : days.toFixed(1)} day${days === 1 ? "" : "s"} before`;
}
