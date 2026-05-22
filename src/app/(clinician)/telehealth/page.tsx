import Link from "next/link";
import { Video, Plus } from "lucide-react";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EditorialRule, LeafSprig } from "@/components/ui/ornament";
import { PreVisitChecklistClient } from "./pre-visit-checklist-client";
import { AmbientMicToggle } from "./ambient-mic-toggle";

export const metadata = { title: "Telehealth" };

const VIDEO_MODALITY = "video";

function formatTime(date: Date | null): string {
  if (!date) return "—";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusTone(status: string) {
  switch (status) {
    case "in_progress":
      return "danger" as const;
    case "scheduled":
      return "info" as const;
    case "complete":
      return "success" as const;
    default:
      return "neutral" as const;
  }
}

export default async function TelehealthDashboardPage() {
  const user = await requireUser();

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);

  const [todaysVisits, upcoming, dailyKeyConfigured] = await Promise.all([
    prisma.encounter.findMany({
      where: {
        organizationId: user.organizationId!,
        modality: VIDEO_MODALITY,
        OR: [
          { status: "in_progress" },
          {
            status: "scheduled",
            scheduledFor: { gte: startOfDay, lt: endOfDay },
          },
        ],
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            presentingConcerns: true,
          },
        },
      },
      orderBy: [{ status: "asc" }, { scheduledFor: "asc" }],
      take: 50,
    }),
    prisma.encounter.findMany({
      where: {
        organizationId: user.organizationId!,
        modality: VIDEO_MODALITY,
        status: "scheduled",
        scheduledFor: { gte: endOfDay },
      },
      include: {
        patient: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
      orderBy: { scheduledFor: "asc" },
      take: 10,
    }),
    Promise.resolve(Boolean(process.env.DAILY_API_KEY)),
  ]);

  const liveCount = todaysVisits.filter((e) => e.status === "in_progress").length;
  const scheduledTodayCount = todaysVisits.filter(
    (e) => e.status === "scheduled",
  ).length;

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow="Telehealth"
        title="Video visits"
        description="Live and scheduled telehealth encounters across your clinic."
        actions={
          <div className="flex items-center gap-3">
            <Link href="/clinic/patients">
              <Button size="sm" variant="secondary" title="Select a patient to start a new video call">
                <Video size={14} className="mr-1.5" />
                New call
                <Plus size={11} className="ml-1 opacity-60" />
              </Button>
            </Link>
            <Badge tone={dailyKeyConfigured ? "success" : "warning"}>
              {dailyKeyConfigured ? "Daily.co connected" : "Demo mode"}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-[10px] text-text-subtle uppercase tracking-wider">
              Live now
            </p>
            <p className="font-display text-3xl text-text mt-2 tabular-nums">
              {liveCount}
            </p>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-[10px] text-text-subtle uppercase tracking-wider">
              Scheduled today
            </p>
            <p className="font-display text-3xl text-text mt-2 tabular-nums">
              {scheduledTodayCount}
            </p>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-[10px] text-text-subtle uppercase tracking-wider">
              Upcoming
            </p>
            <p className="font-display text-3xl text-text mt-2 tabular-nums">
              {upcoming.length}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LeafSprig size={16} className="text-accent" />
                Today
              </CardTitle>
              <CardDescription>
                Live visits and visits scheduled for today.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {todaysVisits.length === 0 ? (
                <EmptyState
                  title="No video visits today"
                  description="Scheduled telehealth encounters will appear here. Start a new visit from a patient chart."
                />
              ) : (
                <ul className="space-y-2">
                  {todaysVisits.map((visit) => (
                    <li key={visit.id}>
                      <Link
                        href={`/clinic/patients/${visit.patient.id}/telehealth`}
                        className="flex items-center gap-4 p-4 rounded-xl border border-border bg-surface hover:bg-surface-muted transition-colors"
                      >
                        <div className="h-10 w-10 rounded-full bg-accent/10 text-accent flex items-center justify-center font-display text-sm shrink-0">
                          {visit.patient.firstName[0]}
                          {visit.patient.lastName[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-text truncate">
                              {visit.patient.firstName} {visit.patient.lastName}
                            </p>
                            <Badge tone={statusTone(visit.status)} className="text-[9px]">
                              {visit.status === "in_progress" ? "LIVE" : visit.status}
                            </Badge>
                          </div>
                          {visit.patient.presentingConcerns && (
                            <p className="text-xs text-text-muted mt-0.5 truncate">
                              {visit.patient.presentingConcerns}
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-xs text-text-muted">
                            {formatTime(visit.scheduledFor)}
                          </p>
                          {visit.reason && (
                            <p className="text-[10px] text-text-subtle mt-0.5 truncate max-w-[140px]">
                              {visit.reason}
                            </p>
                          )}
                        </div>
                        <Button
                          variant={visit.status === "in_progress" ? "primary" : "secondary"}
                          size="sm"
                        >
                          {visit.status === "in_progress" ? "Rejoin" : "Start"}
                        </Button>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Upcoming</CardTitle>
              <CardDescription>Scheduled video visits beyond today.</CardDescription>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-sm text-text-muted">No upcoming video visits scheduled.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {upcoming.map((visit) => (
                    <li
                      key={visit.id}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm text-text">
                          {visit.patient.firstName} {visit.patient.lastName}
                        </p>
                        <p className="text-xs text-text-muted">
                          {visit.scheduledFor?.toLocaleString(undefined, {
                            weekday: "short",
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <Link
                        href={`/clinic/patients/${visit.patient.id}/telehealth`}
                        className="text-xs text-accent hover:underline"
                      >
                        Prepare
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Setup</CardTitle>
              <CardDescription>
                Daily.co powers all video sessions.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">API key</span>
                  <Badge tone={dailyKeyConfigured ? "success" : "warning"} className="text-[9px]">
                    {dailyKeyConfigured ? "Configured" : "Missing"}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Recording</span>
                  <span className="text-xs text-text">Off (HIPAA default)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-muted">Room privacy</span>
                  <span className="text-xs text-text">Private + token-gated</span>
                </div>
                <EditorialRule />
                <p className="text-xs text-text-muted leading-relaxed">
                  Without a {`DAILY_API_KEY`}, visits run in demo mode with deterministic
                  room URLs — useful for local testing.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Pre-visit checklist</CardTitle>
            </CardHeader>
            <CardContent>
              <PreVisitChecklistClient />
            </CardContent>
          </Card>

          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Ambient mic</CardTitle>
              <CardDescription>
                Passive microphone for hands-free note capture between visits.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AmbientMicToggle />
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
