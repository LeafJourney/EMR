// EMR-037 — Communications Overlay hub.
//
// Single landing page that surfaces every channel the clinician
// uses inside the EMR (text, video, fax, phone with AI transcription)
// plus quick links to deeper tabs (transcript queue, SMS broadcast).
//
// We intentionally don't try to render an inline call here — call
// launching belongs to the chart / inbox where the counterparty is
// already in scope. This page is the "command center" overview.

import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelative } from "@/lib/utils/format";

export const metadata = { title: "Communications" };

export default async function CommunicationsPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [
    callsThisWeek,
    pendingTranscripts,
    pendingFaxes,
    activeCampaigns,
    upcomingZoom,
    newVoicemails,
    recentCalls,
    recentFaxes,
    recentCampaigns,
  ] = await Promise.all([
    prisma.callLog.count({
      where: { organizationId: orgId, startedAt: { gte: since } },
    }),
    prisma.callTranscript.count({
      where: { organizationId: orgId, status: "pending_review" },
    }),
    prisma.faxRecord.count({
      where: {
        organizationId: orgId,
        status: { in: ["queued", "sending"] },
      },
    }),
    prisma.outreachCampaign.count({
      where: {
        organizationId: orgId,
        status: { in: ["scheduled", "sending"] },
      },
    }),
    prisma.callLog.count({
      where: {
        organizationId: orgId,
        zoomMeetingId: { not: null },
        zoomScheduledAt: { gte: new Date() },
        status: { in: ["initiated", "ringing", "in_progress"] },
      },
    }),
    prisma.voicemail.count({
      where: { organizationId: orgId, status: "new" },
    }),
    prisma.callLog.findMany({
      where: { organizationId: orgId },
      orderBy: { startedAt: "desc" },
      take: 8,
      include: {
        patient: { select: { firstName: true, lastName: true } },
        providerUser: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.faxRecord.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.outreachCampaign.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 4,
      include: { _count: { select: { recipients: true } } },
    }),
  ]);

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Communications"
        title="Communications Overlay"
        description="Text, video, fax, and HIPAA-compliant calling — all in one workspace. AI transcription captures only pertinent clinical info. Personal data is discarded before documented."
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
        {/* EMR-690 — CALLS / BEAM / VOICEMAIL / TRANSCRIPTS / FAXES / OUTREACH
            tile labels match the all-caps spec; Zoom renamed to Beam. */}
        <MetricTile
          label="CALLS (7 DAYS)"
          value={callsThisWeek}
          accent="forest"
          hint="Phone + video sessions logged"
        />
        <MetricTile
          label="BEAM UPCOMING"
          value={upcomingZoom}
          accent={upcomingZoom > 0 ? "forest" : "none"}
          hint="HIPAA-compliant Beam visits"
        />
        <MetricTile
          label="NEW VOICEMAILS"
          value={newVoicemails}
          accent={newVoicemails > 0 ? "amber" : "none"}
          hint="Awaiting clinician review"
        />
        <MetricTile
          label="TRANSCRIPTS TO REVIEW"
          value={pendingTranscripts}
          accent={pendingTranscripts > 0 ? "amber" : "none"}
          hint="Pertinent-info-only summaries"
        />
        <MetricTile
          label="FAXES IN FLIGHT"
          value={pendingFaxes}
          accent={pendingFaxes > 0 ? "amber" : "none"}
          hint="Queued or sending"
        />
        <MetricTile
          label="ACTIVE OUTREACH"
          value={activeCampaigns}
          accent="forest"
          hint="SMS + email campaigns"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <ChannelCard
          title="Text — Patient Inbox"
          description="AI-triaged secure messaging with patients."
          href="/clinic/messages"
          cta="Open inbox"
        />
        {/* EMR-690 — "provider chats" + Beam rename throughout. */}
        <ChannelCard
          title="Provider chats"
          description="HIPAA-compliant chat between providers in your org."
          href="/clinic/providers/messages"
          cta="Open channel"
        />
        <ChannelCard
          title="Beam telehealth"
          description="HIPAA-compliant video visits — E2EE, waiting room, no cloud recording."
          href="/clinic/communications/beam"
          cta={upcomingZoom > 0 ? `${upcomingZoom} upcoming` : "Schedule"}
          highlight={upcomingZoom > 0}
        />
        <ChannelCard
          title="Voicemail"
          description="HIPAA voicemail with redacted AI transcript — personal data discarded."
          href="/clinic/communications/voicemail"
          cta={newVoicemails > 0 ? `${newVoicemails} new` : "Open inbox"}
          highlight={newVoicemails > 0}
        />
        <ChannelCard
          title="Transcript review"
          description="Approve AI-redacted call summaries before they hit the chart."
          href="/clinic/communications/transcripts"
          cta={pendingTranscripts > 0 ? `Review ${pendingTranscripts}` : "Open queue"}
          highlight={pendingTranscripts > 0}
        />
        <ChannelCard
          title="Fax"
          description="Send and receive HIPAA-compliant faxes."
          href="/clinic/communications/fax"
          cta="Open fax"
        />
        <ChannelCard
          title="Outreach broadcasts"
          description="Practice-level SMS or email campaigns to patient cohorts."
          href="/clinic/communications/broadcasts"
          cta="Open broadcast"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Recent calls</CardTitle>
            <CardDescription>
              Last 8 phone or video sessions across the practice.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentCalls.length === 0 ? (
              <EmptyState
                title="No calls yet"
                description="Calls launched from the inbox or chart will appear here."
              />
            ) : (
              recentCalls.map((call) => {
                const counterparty =
                  call.patient
                    ? `${call.patient.firstName} ${call.patient.lastName}`
                    : call.providerUser
                      ? `${call.providerUser.firstName} ${call.providerUser.lastName}`
                      : call.externalNumber ?? "Unknown";
                return (
                  <div
                    key={call.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-muted"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-text truncate">
                        {counterparty}
                      </p>
                      <p className="text-[11px] text-text-subtle">
                        {call.channel} · {call.direction} ·{" "}
                        {formatRelative(call.startedAt.toISOString())}
                      </p>
                    </div>
                    <Badge tone={callBadgeTone(call.status)}>
                      {call.status.replace("_", " ")}
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Recent faxes</CardTitle>
            <CardDescription>
              Inbound + outbound fax activity.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentFaxes.length === 0 ? (
              <EmptyState
                title="No faxes yet"
                description="Send your first fax from the fax tab."
              />
            ) : (
              recentFaxes.map((fax) => (
                <div
                  key={fax.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text truncate">
                      {fax.direction === "outbound" ? "→ " : "← "}
                      {fax.toNumber}
                      {fax.patient && (
                        <span className="text-text-subtle">
                          {" "}
                          · {fax.patient.firstName} {fax.patient.lastName}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-text-subtle">
                      {fax.pageCount ?? "?"} pages ·{" "}
                      {formatRelative(fax.createdAt.toISOString())}
                    </p>
                  </div>
                  <Badge tone={faxBadgeTone(fax.status)}>{fax.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card tone="raised" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent broadcasts</CardTitle>
            <CardDescription>
              Latest practice-wide outreach campaigns.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentCampaigns.length === 0 ? (
              <EmptyState
                title="No campaigns yet"
                description="Use SMS broadcast to message patient cohorts."
              />
            ) : (
              recentCampaigns.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-muted"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text truncate">{c.name}</p>
                    <p className="text-[11px] text-text-subtle">
                      {c.channel.toUpperCase()} · {c._count.recipients}{" "}
                      recipients ·{" "}
                      {formatRelative(c.createdAt.toISOString())}
                    </p>
                  </div>
                  <Badge tone={campaignBadgeTone(c.status)}>{c.status}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function ChannelCard({
  title,
  description,
  href,
  cta,
  highlight,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
  highlight?: boolean;
}) {
  return (
    <Card tone={highlight ? "raised" : "default"}>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <Link href={href}>
          <Button variant={highlight ? "primary" : "secondary"} size="sm">
            {cta}
          </Button>
        </Link>
      </CardContent>
    </Card>
  );
}

function callBadgeTone(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "completed":
      return "success";
    case "in_progress":
    case "ringing":
    case "initiated":
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

function faxBadgeTone(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "delivered":
    case "received":
      return "success";
    case "queued":
    case "sending":
      return "info";
    case "failed":
      return "danger";
    default:
      return "neutral";
  }
}

function campaignBadgeTone(
  status: string,
): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "completed":
      return "success";
    case "scheduled":
    case "sending":
      return "info";
    case "failed":
      return "danger";
    case "cancelled":
      return "warning";
    default:
      return "neutral";
  }
}
