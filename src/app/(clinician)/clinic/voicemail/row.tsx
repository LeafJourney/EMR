"use client";

// EMR-146 — Callback queue row.
//
// Each entry shows the priority reason, redacted summary, audio
// playback (when a recording is on file), and the actions a clinician
// would take during a callback shift: mark listened, archive, jump to
// the patient chart. Calls into the existing voicemail server actions
// at /clinic/communications/voicemail/actions.

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import {
  markVoicemailListenedAction,
  archiveVoicemailAction,
} from "../communications/voicemail/actions";
import { PatientHoverCard } from "@/components/preview";

export interface CallbackRowVM {
  id: string;
  priority: "urgent" | "normal" | "follow_up";
  reason: string;
  waitDisplay: string;
  status: "new" | "listened" | "archived";
  fromNumber: string;
  patientId: string | null;
  patientName: string | null;
  durationSeconds: number | null;
  audioStorageKey: string | null;
  pertinentSummary: string;
  clinicalBullets: string[];
  redactedCategories: string[];
  assignedToName: string | null;
  relativeReceived: string;
}

const PRIORITY_TONE: Record<
  CallbackRowVM["priority"],
  "danger" | "info" | "neutral"
> = {
  urgent: "danger",
  normal: "info",
  follow_up: "neutral",
};

export function VoicemailCallbackRow({ entry }: { entry: CallbackRowVM }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(entry.priority === "urgent");

  function run(
    action: (fd: FormData) => Promise<{ ok: boolean; error?: string }>,
    fd: FormData,
  ) {
    setError(null);
    startTransition(async () => {
      const r = await action(fd);
      if (!r.ok) setError(r.error ?? "Action failed.");
    });
  }

  const audioSrc = entry.audioStorageKey
    ? `/api/communications/voicemail/${entry.id}/audio`
    : null;

  return (
    <div
      className={cn(
        "rounded-lg border bg-surface px-4 py-3 transition-colors",
        entry.priority === "urgent"
          ? "border-danger/40 bg-red-50/40"
          : "border-border",
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="mt-0.5 text-text-subtle hover:text-text shrink-0"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? "▾" : "▸"}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone={PRIORITY_TONE[entry.priority]}>
              {entry.priority === "follow_up" ? "Follow-up" : entry.priority}
            </Badge>
            {entry.status === "new" && <Badge tone="info">Unread</Badge>}
            <span className="text-sm font-medium text-text truncate">
              {entry.patientId && entry.patientName ? (
                <PatientHoverCard patientId={entry.patientId}>
                  <Link
                    href={`/clinic/patients/${entry.patientId}`}
                    className="hover:text-accent"
                  >
                    {entry.patientName}
                  </Link>
                </PatientHoverCard>
              ) : (
                entry.patientName ?? entry.fromNumber
              )}
            </span>
            {entry.patientName && (
              <span className="text-xs text-text-subtle">
                {entry.fromNumber}
              </span>
            )}
          </div>
          <p className="text-[12px] text-text-muted mt-0.5">
            {entry.reason} · waiting {entry.waitDisplay} ·{" "}
            {entry.relativeReceived}
            {entry.assignedToName && <> · → {entry.assignedToName}</>}
          </p>
        </div>
        <div className="text-right shrink-0">
          <span className="text-[11px] tabular-nums text-text-subtle">
            {entry.durationSeconds ? `${entry.durationSeconds}s` : "—"}
          </span>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 pl-7 space-y-3">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-text-subtle mb-1">
              Pertinent summary (PHI redacted)
            </p>
            <p className="text-sm text-text leading-relaxed">
              {entry.pertinentSummary}
            </p>
          </div>

          {entry.clinicalBullets.length > 0 && (
            <ul className="text-sm text-text list-disc list-inside space-y-0.5">
              {entry.clinicalBullets.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          )}

          {audioSrc ? (
            <audio
              controls
              preload="none"
              src={audioSrc}
              className="w-full h-10"
            />
          ) : (
            <p className="text-[11px] text-text-subtle italic">
              No recording on file.
            </p>
          )}

          {entry.redactedCategories.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {entry.redactedCategories.map((c) => (
                <Badge key={c} tone="warning">
                  {c} stripped
                </Badge>
              ))}
            </div>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          <div className="flex items-center gap-2 flex-wrap">
            {entry.status === "new" && (
              <Button
                size="sm"
                variant="primary"
                disabled={pending}
                onClick={() => {
                  const fd = new FormData();
                  fd.set("voicemailId", entry.id);
                  run(markVoicemailListenedAction, fd);
                }}
              >
                Mark listened
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                const fd = new FormData();
                fd.set("voicemailId", entry.id);
                run(archiveVoicemailAction, fd);
              }}
            >
              Archive
            </Button>
            {entry.patientId && (
              <Link
                href={`/clinic/patients/${entry.patientId}`}
                className="text-xs text-accent hover:underline ml-auto"
              >
                Open chart →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
