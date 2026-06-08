"use client";

/**
 * No-show defense cockpit — orchestrates the scheduling engines into one
 * front-desk workflow:
 *   - EMR-207 no-show model: each upcoming visit is risk-scored server-side.
 *   - tierPlaybook: turns the tier into a recommended action (how many
 *     reminders, whether a live confirm is needed, whether it's overbook-eligible).
 *   - EMR-211 reminders: an on-demand preview of the exact reminder timeline
 *     (buildReminderPlan) the workers would enqueue for that visit.
 *   - EMR-210 waitlist: overbook-eligible visits deep-link to the waitlist to
 *     pre-fill the slot.
 *
 * The operator triages: each visit can be marked "handled" (localStorage-interim
 * per browser) so the board reflects what's been worked. Actual reminder
 * dispatch runs on the comms worker (sendDueAppointmentReminders) — this surface
 * decides *what to do*, it doesn't fake the send.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Eyebrow } from "@/components/ui/ornament";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import {
  buildReminderPlan,
  type ChannelPrefs,
  type ReminderChannel,
} from "@/lib/scheduling/reminders";
import type { RiskTier } from "@/lib/scheduling/no-show-model";

export type RiskedVisit = {
  id: string;
  patient: { id: string; firstName: string; lastName: string };
  providerName: string | null;
  startAt: string; // ISO
  modality: string;
  status: string;
  tier: "medium" | "high";
  probability: number;
  topFactors: { factor: string; contribution: number }[];
  playbook: {
    remindersToSend: number;
    requiresLiveConfirm: boolean;
    eligibleForOverbook: boolean;
  };
};

const MODALITY_LABEL: Record<string, string> = {
  in_person: "In-person",
  video: "Video",
  phone: "Phone",
};

const CHANNEL_LABEL: Record<ReminderChannel, string> = {
  sms: "SMS",
  email: "Email",
  push: "Push",
  voice_call: "Live call",
};

// Sensible org defaults for the plan preview (the real per-org prefs live on
// CommunicationPreference; the preview just shows the shape of the timeline).
const PREVIEW_PREFS: ChannelPrefs = {
  smsOptIn: true,
  emailOptIn: true,
  pushOptIn: true,
  quietHours: { startHour: 21, endHour: 8 },
  timezone: "America/Los_Angeles",
  preferredChannel: "sms",
};

const HANDLED_KEY = "noshow-defense:handled:v1";

function fmtWhen(iso: string): string {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) +
    " · " +
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
  );
}

function offsetLabel(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)}m before`;
  if (hours < 24) return `${hours}h before`;
  const days = hours / 24;
  return `${days % 1 === 0 ? days : days.toFixed(1)}d before`;
}

export function NoShowCockpit({ visits }: { visits: RiskedVisit[] }) {
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(HANDLED_KEY);
      if (raw) setHandled(new Set(JSON.parse(raw) as string[]));
    } catch {
      /* ignore */
    }
    setHydrated(true);
  }, []);

  function toggleHandled(id: string) {
    setHandled((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        window.localStorage.setItem(HANDLED_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  // Only count/show visits still in the loaded set (stale handled ids age out).
  const outstanding = useMemo(
    () => visits.filter((v) => !handled.has(v.id)),
    [visits, handled],
  );

  const summary = useMemo(() => {
    const high = outstanding.filter((v) => v.tier === "high").length;
    const medium = outstanding.filter((v) => v.tier === "medium").length;
    const reminders = outstanding.reduce((s, v) => s + v.playbook.remindersToSend, 0);
    const overbook = outstanding.filter((v) => v.playbook.eligibleForOverbook).length;
    const liveConfirm = outstanding.filter((v) => v.playbook.requiresLiveConfirm).length;
    return { high, medium, reminders, overbook, liveConfirm };
  }, [outstanding]);

  if (visits.length === 0) {
    return (
      <EmptyState
        title="No at-risk visits in the next two weeks"
        description="Every upcoming appointment is scoring low no-show risk. Nothing to defend right now."
      />
    );
  }

  return (
    <>
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
        <Stat label="High risk" value={summary.high} tone="danger" />
        <Stat label="Elevated" value={summary.medium} tone="warning" />
        <Stat label="Reminders to send" value={summary.reminders} tone="accent" />
        <Stat label="Live confirms" value={summary.liveConfirm} tone="text" />
        <Stat label="Overbook-eligible" value={summary.overbook} tone="text" />
      </div>

      <div className="mb-3 flex items-center justify-between">
        <Eyebrow>Defense queue</Eyebrow>
        <span className="text-[11px] text-text-subtle">
          {hydrated && handled.size > 0
            ? `${outstanding.length} open · ${visits.length - outstanding.length} handled`
            : `${visits.length} flagged`}
        </span>
      </div>

      <div className="space-y-2.5">
        {visits.map((v) => {
          const isHandled = handled.has(v.id);
          const pct = Math.round(v.probability * 100);
          return (
            <Card
              key={v.id}
              tone="raised"
              className={cn(
                "transition-opacity",
                isHandled && "opacity-50",
                v.tier === "high" && !isHandled && "border-danger/30",
              )}
            >
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start gap-3">
                  <Avatar
                    firstName={v.patient.firstName}
                    lastName={v.patient.lastName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/clinic/patients/${v.patient.id}`}
                        className="text-sm font-medium text-text hover:text-accent hover:underline"
                      >
                        {v.patient.firstName} {v.patient.lastName}
                      </Link>
                      <Badge
                        tone={v.tier === "high" ? "danger" : "warning"}
                        className="text-[9px]"
                      >
                        ⚠ {pct}% no-show
                      </Badge>
                    </div>
                    <p className="text-[11px] text-text-subtle tabular-nums mt-0.5">
                      {fmtWhen(v.startAt)} · {MODALITY_LABEL[v.modality] ?? v.modality}
                      {v.providerName ? ` · ${v.providerName}` : ""}
                    </p>

                    {/* Why — top contributing factors */}
                    {v.topFactors.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {v.topFactors
                          .filter((f) => f.contribution > 0)
                          .slice(0, 3)
                          .map((f) => (
                            <span
                              key={f.factor}
                              className="text-[9px] text-text-muted bg-surface-muted/70 border border-border/50 rounded-full px-2 py-0.5"
                            >
                              {f.factor}
                            </span>
                          ))}
                      </div>
                    )}

                    {/* Recommended actions from the tier playbook */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      <button
                        type="button"
                        onClick={() => setExpanded(expanded === v.id ? null : v.id)}
                        className="text-[11px] font-medium text-accent hover:underline"
                      >
                        {expanded === v.id ? "Hide" : "Send"} {v.playbook.remindersToSend} reminder
                        {v.playbook.remindersToSend === 1 ? "" : "s"}
                      </button>
                      {v.playbook.requiresLiveConfirm && (
                        <Badge tone="warning" className="text-[9px]">📞 Live confirm</Badge>
                      )}
                      {v.playbook.eligibleForOverbook && (
                        <Link
                          href="/ops/waitlist"
                          className="text-[11px] font-medium text-accent hover:underline"
                        >
                          Fill from waitlist →
                        </Link>
                      )}
                    </div>

                    {/* Reminder plan preview (real engine) */}
                    {expanded === v.id && (
                      <ReminderPlanPreview tier={v.tier} startAt={v.startAt} apptId={v.id} patientId={v.patient.id} />
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => toggleHandled(v.id)}
                    className={cn(
                      "shrink-0 text-[11px] font-medium rounded-full border px-3 py-1 transition-colors",
                      isHandled
                        ? "border-success/40 bg-[color:var(--accent-soft)] text-success"
                        : "border-border text-text-muted hover:border-accent/40 hover:text-accent",
                    )}
                  >
                    {isHandled ? "✓ Handled" : "Mark handled"}
                  </button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-[11px] leading-relaxed text-text-subtle rounded-lg bg-surface-muted/60 border border-border/60 px-3 py-2 mt-6">
        Risk is scored from each patient&apos;s visit history (EMR-207). Recommended
        touches come from the tier playbook; the timeline preview is exactly what the
        reminder workers enqueue (EMR-211). &quot;Handled&quot; is your triage marker
        (this browser) — actual sends run on the comms worker.
      </p>
    </>
  );
}

function ReminderPlanPreview({
  tier,
  startAt,
  apptId,
  patientId,
}: {
  tier: RiskTier;
  startAt: string;
  apptId: string;
  patientId: string;
}) {
  const jobs = useMemo(
    () =>
      buildReminderPlan({
        appointmentId: apptId,
        patientId,
        startAt: new Date(startAt),
        riskTier: tier,
        prefs: PREVIEW_PREFS,
        bookedAt: new Date(),
        preConfirmed: false,
      }).sort((a, b) => a.sendAt.getTime() - b.sendAt.getTime()),
    [tier, startAt, apptId, patientId],
  );

  if (jobs.length === 0) {
    return (
      <p className="text-[11px] text-text-subtle italic mt-2 pl-3 border-l-2 border-border">
        No reminders would fire before this visit (it&apos;s too soon, or channels are off).
      </p>
    );
  }

  return (
    <ul className="mt-2 pl-3 border-l-2 border-accent/30 space-y-1">
      {jobs.map((job) => (
        <li key={job.jobKey} className="flex items-center gap-2 text-[11px]">
          <Badge tone="neutral" className="text-[9px] w-12 justify-center shrink-0">
            {CHANNEL_LABEL[job.channel]}
          </Badge>
          <span className="text-text-muted tabular-nums">{offsetLabel(job.offsetHours)}</span>
          <span className="text-text-subtle">·</span>
          <span className="text-text-subtle">{job.template.replace(/_/g, " ")}</span>
          {job.expectsResponse && <Badge tone="accent" className="text-[9px]">confirm</Badge>}
        </li>
      ))}
    </ul>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "accent" | "text";
}) {
  const colors: Record<typeof tone, string> = {
    danger: "text-danger",
    warning: "text-[color:var(--warning)]",
    accent: "text-accent",
    text: "text-text",
  };
  return (
    <Card tone="raised">
      <CardContent className="pt-4 pb-4">
        <p className={cn("font-display text-3xl tabular-nums", colors[tone])}>{value}</p>
        <p className="text-xs text-text-muted mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
