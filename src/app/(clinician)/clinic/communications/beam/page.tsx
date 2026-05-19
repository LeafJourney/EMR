// EMR-143 — HIPAA-compliant Zoom meetings.
//
// Lists scheduled and recent Zoom telehealth visits and exposes a
// scheduling form. Each meeting is created with HIPAA-safe defaults
// (E2EE, waiting room, no cloud recording) and the passcode is stored
// encrypted at rest — only the host's view ever shows the plaintext.

import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { decryptMessageBodySafe } from "@/lib/communications/message-crypto";
import { formatZoomMeetingId } from "@/lib/communications/zoom";
import { formatRelative } from "@/lib/utils/format";
import { ZoomScheduleForm } from "./schedule-form";

export const metadata = { title: "Zoom telehealth" };

export default async function ZoomPage() {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <div className="text-sm text-text-muted">No organization context.</div>
      </PageShell>
    );
  }

  const now = new Date();
  const [upcoming, recent, providers] = await Promise.all([
    prisma.callLog.findMany({
      where: {
        organizationId: orgId,
        zoomMeetingId: { not: null },
        zoomScheduledAt: { gte: now },
        status: { in: ["initiated", "ringing", "in_progress"] },
      },
      orderBy: { zoomScheduledAt: "asc" },
      include: {
        patient: { select: { firstName: true, lastName: true } },
        providerUser: { select: { firstName: true, lastName: true } },
        initiator: { select: { firstName: true, lastName: true, id: true } },
      },
    }),
    prisma.callLog.findMany({
      where: {
        organizationId: orgId,
        zoomMeetingId: { not: null },
        OR: [
          { zoomScheduledAt: { lt: now } },
          { status: { in: ["completed", "missed", "failed", "cancelled"] } },
        ],
      },
      orderBy: { zoomScheduledAt: "desc" },
      take: 12,
      include: {
        patient: { select: { firstName: true, lastName: true } },
        providerUser: { select: { firstName: true, lastName: true } },
      },
    }),
    prisma.provider.findMany({
      where: {
        organizationId: orgId,
        active: true,
        userId: { not: user.id },
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    }),
  ]);

  const recipientOptions = providers.map((p) => ({
    userId: p.user.id,
    name: `${p.user.firstName} ${p.user.lastName}`,
    title: p.title ?? null,
  }));

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Communications"
        title="Zoom telehealth"
        description="HIPAA-compliant video visits. End-to-end encryption, waiting rooms, and disabled cloud recording are enforced on every meeting."
      />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2">
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Schedule a visit</CardTitle>
              <CardDescription>
                A Zoom meeting is created with HIPAA defaults; the passcode is
                stored encrypted at rest. Hosts get a one-click join link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ZoomScheduleForm providerOptions={recipientOptions} />
            </CardContent>
          </Card>

          <Card tone="default" className="mt-4">
            <CardHeader>
              <CardTitle className="text-sm">HIPAA posture</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-text-muted space-y-1">
              <p>· End-to-end encryption (enhanced)</p>
              <p>· Waiting room required for every visit</p>
              <p>· Cloud + local recording disabled</p>
              <p>· Passcode required, AES-256-GCM at rest</p>
              <p>· Join-before-host disabled, mute on entry on</p>
              <p className="pt-1 italic">
                BAA must be on file with Zoom Healthcare for production use.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-3 space-y-4">
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Upcoming visits</CardTitle>
              <CardDescription>
                {upcoming.length} scheduled — earliest first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcoming.length === 0 ? (
                <EmptyState
                  title="No upcoming Zoom visits"
                  description="Use the form to schedule one — patient or provider."
                />
              ) : (
                upcoming.map((call) => {
                  const isHost = call.initiator?.id === user.id;
                  const passcode = isHost && call.zoomPasscodeCipher
                    ? decryptMessageBodySafe(call.zoomPasscodeCipher)
                    : null;
                  const counterparty = call.patient
                    ? `${call.patient.firstName} ${call.patient.lastName}`
                    : call.providerUser
                      ? `${call.providerUser.firstName} ${call.providerUser.lastName}`
                      : "External";
                  return (
                    <div
                      key={call.id}
                      className="rounded-xl border border-border bg-surface px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-text truncate">
                            {call.zoomTopic ?? "Zoom visit"}
                          </p>
                          <p className="text-[11px] text-text-subtle mt-0.5">
                            {counterparty} ·{" "}
                            {call.zoomScheduledAt
                              ? new Date(call.zoomScheduledAt).toLocaleString(
                                  "en-US",
                                  {
                                    weekday: "short",
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  },
                                )
                              : "—"}{" "}
                            · {call.zoomDurationMinutes ?? "?"} min
                          </p>
                          <p className="text-[11px] text-text-subtle mt-0.5">
                            Meeting ID:{" "}
                            <span className="tabular-nums">
                              {call.zoomMeetingId
                                ? formatZoomMeetingId(call.zoomMeetingId)
                                : "—"}
                            </span>
                            {passcode && (
                              <>
                                {" · Passcode: "}
                                <span className="tabular-nums">{passcode}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <Badge tone="success">HIPAA Zoom</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-3">
                        {call.zoomJoinUrl && (
                          <Link
                            href={call.zoomJoinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button size="sm" variant="primary">
                              Join visit
                            </Button>
                          </Link>
                        )}
                        {isHost && call.zoomHostJoinUrl && (
                          <Link
                            href={call.zoomHostJoinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <Button size="sm" variant="secondary">
                              Host start
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Recent visits</CardTitle>
              <CardDescription>Last 12 completed or past Zoom visits.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {recent.length === 0 ? (
                <EmptyState
                  title="No past visits"
                  description="Completed and missed Zoom visits will appear here."
                />
              ) : (
                recent.map((call) => {
                  const counterparty = call.patient
                    ? `${call.patient.firstName} ${call.patient.lastName}`
                    : call.providerUser
                      ? `${call.providerUser.firstName} ${call.providerUser.lastName}`
                      : "External";
                  return (
                    <div
                      key={call.id}
                      className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-surface-muted"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-text truncate">
                          {call.zoomTopic ?? "Zoom visit"} · {counterparty}
                        </p>
                        <p className="text-[11px] text-text-subtle">
                          {call.zoomScheduledAt
                            ? formatRelative(call.zoomScheduledAt.toISOString())
                            : formatRelative(call.startedAt.toISOString())}
                          {call.durationSeconds
                            ? ` · ${Math.round(call.durationSeconds / 60)} min`
                            : ""}
                        </p>
                      </div>
                      <Badge tone={statusTone(call.status)}>
                        {call.status.replace("_", " ")}
                      </Badge>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}

function statusTone(
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
