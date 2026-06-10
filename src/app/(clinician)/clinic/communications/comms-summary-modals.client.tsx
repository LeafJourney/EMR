"use client";

// EMR-673 — MetricTile summary grid wired to inline detail modals for
// channels where the server already fetches recent-activity data.
// Tiles without pre-fetched data (Beam, Voicemail, Transcripts) keep
// their Link → full-page navigation so the modal approach is additive.

import { useState } from "react";
import Link from "next/link";
import { MetricTile } from "@/components/ui/metric-tile";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatRelative } from "@/lib/utils/format";
import type { CallRow, FaxRow, BroadcastRow } from "./comms-recent-client";

type ModalKey = "calls" | "faxes" | "broadcasts";

function badgeTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "completed":
    case "delivered":
    case "received":
      return "success";
    case "in_progress":
    case "ringing":
    case "initiated":
    case "queued":
    case "sending":
    case "scheduled":
      return "info";
    case "missed":
    case "cancelled":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

export function CommsSummaryModals({
  callsThisWeek,
  upcomingBeam,
  newVoicemails,
  pendingTranscripts,
  pendingFaxes,
  activeCampaigns,
  recentCalls,
  recentFaxes,
  recentBroadcasts,
}: {
  callsThisWeek: number;
  upcomingBeam: number;
  newVoicemails: number;
  pendingTranscripts: number;
  pendingFaxes: number;
  activeCampaigns: number;
  recentCalls: CallRow[];
  recentFaxes: FaxRow[];
  recentBroadcasts: BroadcastRow[];
}) {
  const [open, setOpen] = useState<ModalKey | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        <button
          type="button"
          className="block text-left group"
          onClick={() => setOpen("calls")}
          aria-label="View recent calls"
        >
          <MetricTile
            label="CALLS (7 DAYS)"
            value={callsThisWeek}
            accent="forest"
            hint="Click to preview recent sessions"
            className="group-hover:ring-1 group-hover:ring-accent/30 transition-shadow cursor-pointer"
          />
        </button>

        <Link href="/clinic/communications/beam" className="block group">
          <MetricTile
            label="BEAM UPCOMING"
            value={upcomingBeam}
            accent={upcomingBeam > 0 ? "forest" : "none"}
            hint="HIPAA-compliant Beam visits"
            className="group-hover:ring-1 group-hover:ring-accent/30 transition-shadow"
          />
        </Link>

        <Link href="/clinic/communications/voicemail" className="block group">
          <MetricTile
            label="NEW VOICEMAILS"
            value={newVoicemails}
            accent={newVoicemails > 0 ? "amber" : "none"}
            hint="Awaiting clinician review"
            className="group-hover:ring-1 group-hover:ring-accent/30 transition-shadow"
          />
        </Link>

        <Link href="/clinic/communications/transcripts" className="block group">
          <MetricTile
            label="TRANSCRIPTS TO REVIEW"
            value={pendingTranscripts}
            accent={pendingTranscripts > 0 ? "amber" : "none"}
            hint="Pertinent-info-only summaries"
            className="group-hover:ring-1 group-hover:ring-accent/30 transition-shadow"
          />
        </Link>

        <button
          type="button"
          className="block text-left group"
          onClick={() => setOpen("faxes")}
          aria-label="View recent faxes"
        >
          <MetricTile
            label="FAXES IN FLIGHT"
            value={pendingFaxes}
            accent={pendingFaxes > 0 ? "amber" : "none"}
            hint="Click to preview recent faxes"
            className="group-hover:ring-1 group-hover:ring-accent/30 transition-shadow cursor-pointer"
          />
        </button>

        <button
          type="button"
          className="block text-left group"
          onClick={() => setOpen("broadcasts")}
          aria-label="View recent broadcasts"
        >
          <MetricTile
            label="ACTIVE OUTREACH"
            value={activeCampaigns}
            accent="forest"
            hint="Click to preview recent campaigns"
            className="group-hover:ring-1 group-hover:ring-accent/30 transition-shadow cursor-pointer"
          />
        </button>
      </div>

      {/* Calls detail modal */}
      <Dialog open={open === "calls"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-md">
          <DialogTitle>Recent calls (7 days)</DialogTitle>
          <div className="mt-4 space-y-1 max-h-72 overflow-y-auto">
            {recentCalls.length === 0 ? (
              <p className="text-sm text-text-subtle py-6 text-center">No calls this week.</p>
            ) : (
              recentCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text truncate">{call.counterparty}</p>
                    <p className="text-[11px] text-text-subtle">
                      {call.channel} · {call.direction} · {formatRelative(call.startedAt)}
                    </p>
                  </div>
                  <Badge tone={badgeTone(call.status)}>{call.status.replace("_", " ")}</Badge>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2 mt-5">
            <Link href="/clinic/communications/transcripts" onClick={close}>
              <Button size="sm" variant="secondary">All transcripts</Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={close}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Faxes detail modal */}
      <Dialog open={open === "faxes"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-md">
          <DialogTitle>Recent faxes</DialogTitle>
          <div className="mt-4 space-y-1 max-h-72 overflow-y-auto">
            {recentFaxes.length === 0 ? (
              <p className="text-sm text-text-subtle py-6 text-center">No fax activity.</p>
            ) : (
              recentFaxes.map((fax) => (
                <div
                  key={fax.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text truncate">
                      {fax.direction === "outbound" ? "→ " : "← "}
                      {fax.toNumber}
                      {fax.patientName && (
                        <span className="text-text-subtle"> · {fax.patientName}</span>
                      )}
                    </p>
                    <p className="text-[11px] text-text-subtle">
                      {fax.pageCount ?? "?"} pages · {formatRelative(fax.createdAt)}
                    </p>
                  </div>
                  <Badge tone={badgeTone(fax.status)}>{fax.status}</Badge>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2 mt-5">
            <Link href="/clinic/communications/fax" onClick={close}>
              <Button size="sm" variant="secondary">Open fax center</Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={close}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Broadcasts detail modal */}
      <Dialog open={open === "broadcasts"} onOpenChange={(v) => !v && close()}>
        <DialogContent className="max-w-md">
          <DialogTitle>Recent broadcasts</DialogTitle>
          <div className="mt-4 space-y-1 max-h-72 overflow-y-auto">
            {recentBroadcasts.length === 0 ? (
              <p className="text-sm text-text-subtle py-6 text-center">No broadcasts yet.</p>
            ) : (
              recentBroadcasts.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text truncate">{b.name}</p>
                    <p className="text-[11px] text-text-subtle">
                      {b.channel.toUpperCase()} · {b.recipientCount} recipients ·{" "}
                      {formatRelative(b.createdAt)}
                    </p>
                  </div>
                  <Badge tone={badgeTone(b.status)}>{b.status}</Badge>
                </div>
              ))
            )}
          </div>
          <div className="flex gap-2 mt-5">
            <Link href="/clinic/communications/broadcasts" onClick={close}>
              <Button size="sm" variant="secondary">Open broadcasts</Button>
            </Link>
            <Button size="sm" variant="ghost" onClick={close}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
