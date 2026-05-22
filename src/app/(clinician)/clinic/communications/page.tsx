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
import { Button } from "@/components/ui/button";
import { MetricTile } from "@/components/ui/metric-tile";
import { CommsRecentClient } from "./comms-recent-client";

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
        patient: { select: { id: true, firstName: true, lastName: true } },
        providerUser: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.faxRecord.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
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
        {/* EMR-673 — each tile is a Link to its detail surface.
            EMR-690 — labels use the all-caps spec; Zoom is now Beam. */}
        <Link href="/clinic/communications/transcripts" className="block group">
          <MetricTile
            label="CALLS (7 DAYS)"
            value={callsThisWeek}
            accent="forest"
            hint="Phone + video sessions logged"
            className="group-hover:ring-1 group-hover:ring-accent/30 transition-shadow"
          />
        </Link>
        <Link href="/clinic/communications/beam" className="block group">
          <MetricTile
            label="BEAM UPCOMING"
            value={upcomingZoom}
            accent={upcomingZoom > 0 ? "forest" : "none"}
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
        <Link href="/clinic/communications/fax" className="block group">
          <MetricTile
            label="FAXES IN FLIGHT"
            value={pendingFaxes}
            accent={pendingFaxes > 0 ? "amber" : "none"}
            hint="Queued or sending"
            className="group-hover:ring-1 group-hover:ring-accent/30 transition-shadow"
          />
        </Link>
        <Link href="/clinic/communications/broadcasts" className="block group">
          <MetricTile
            label="ACTIVE OUTREACH"
            value={activeCampaigns}
            accent="forest"
            hint="SMS + email campaigns"
            className="group-hover:ring-1 group-hover:ring-accent/30 transition-shadow"
          />
        </Link>
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

      <CommsRecentClient
        calls={recentCalls.map((call) => ({
          id: call.id,
          counterparty: call.patient
            ? `${call.patient.firstName} ${call.patient.lastName}`
            : call.providerUser
              ? `${call.providerUser.firstName} ${call.providerUser.lastName}`
              : call.externalNumber ?? "Unknown",
          patientId: call.patient?.id,
          channel: call.channel,
          direction: call.direction,
          startedAt: call.startedAt.toISOString(),
          status: call.status,
        }))}
        faxes={recentFaxes.map((fax) => ({
          id: fax.id,
          toNumber: fax.toNumber,
          patientId: fax.patient?.id,
          patientName: fax.patient
            ? `${fax.patient.firstName} ${fax.patient.lastName}`
            : undefined,
          direction: fax.direction,
          pageCount: fax.pageCount,
          createdAt: fax.createdAt.toISOString(),
          status: fax.status,
        }))}
        broadcasts={recentCampaigns.map((c) => ({
          id: c.id,
          name: c.name,
          channel: c.channel,
          recipientCount: c._count.recipients,
          createdAt: c.createdAt.toISOString(),
          status: c.status,
        }))}
      />
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

