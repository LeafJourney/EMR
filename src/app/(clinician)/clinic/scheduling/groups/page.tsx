import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/ornament";
import { GroupSeriesPlanner } from "./group-planner";

export const metadata = { title: "Group Visits" };

/**
 * EMR-213 — Group visits + recurring series.
 *
 * Multi-patient visits ("cannabis 101 cohort", "chronic pain group") plus
 * recurring series (weekly check-ins, monthly cohort). The page surfaces
 * upcoming groups, lets a clinician compose a new series, and shows each
 * series' enrolled patients + attendance rate.
 *
 * In storage, group visits are normal Appointment rows that share a
 * `seriesKey` written into `notes` as a small JSON header. Phase 10 lifts
 * this to a dedicated AppointmentSeries table; for now the convention
 * keeps us schema-stable.
 */
export default async function GroupVisitsPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  // EMR-1110 (FO-M4, minor 2) — the planner needs an explicit series lead:
  // pass the org's active providers, plus the viewer's own provider id (if
  // any) as the default selection.
  const [providerRows, viewerProvider] = await Promise.all([
    prisma.provider.findMany({
      where: { organizationId: orgId, active: true },
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.provider.findFirst({
      where: { organizationId: orgId, userId: user.id, active: true },
      select: { id: true },
    }),
  ]);
  const providerOptions = providerRows.map((p) => ({
    id: p.id,
    name:
      `${p.user?.firstName ?? ""} ${p.user?.lastName ?? ""}`.trim() ||
      "Unnamed provider",
  }));

  const horizonStart = new Date();
  horizonStart.setHours(0, 0, 0, 0);
  const horizonEnd = new Date(horizonStart);
  horizonEnd.setDate(horizonEnd.getDate() + 60);

  const appts = await prisma.appointment.findMany({
    where: {
      patient: { organizationId: orgId },
      startAt: { gte: horizonStart, lt: horizonEnd },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { startAt: "asc" },
  });

  // Bucket by parsed series header.
  const seriesMap = new Map<string, GroupSeriesView>();
  for (const a of appts) {
    const meta = parseSeriesHeader(a.notes);
    if (!meta) continue;
    let series = seriesMap.get(meta.seriesKey);
    if (!series) {
      series = {
        seriesKey: meta.seriesKey,
        title: meta.title,
        cadence: meta.cadence,
        topic: meta.topic,
        provider: a.provider?.user
          ? `${a.provider.user.firstName} ${a.provider.user.lastName}`.trim()
          : "Unassigned",
        sessions: [],
      };
      seriesMap.set(meta.seriesKey, series);
    }
    let session = series.sessions.find(
      (s) => s.startAt.getTime() === a.startAt.getTime(),
    );
    if (!session) {
      session = { startAt: a.startAt, endAt: a.endAt, attendees: [] };
      series.sessions.push(session);
    }
    session.attendees.push({
      patientId: a.patient.id,
      firstName: a.patient.firstName,
      lastName: a.patient.lastName,
      status: a.status,
    });
  }

  const seriesList = Array.from(seriesMap.values()).sort((a, b) => {
    const aNext = a.sessions[0]?.startAt.getTime() ?? Infinity;
    const bNext = b.sessions[0]?.startAt.getTime() ?? Infinity;
    return aNext - bNext;
  });

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow="Scheduling"
        title="Group visits & recurring series"
        description="Multi-patient cohorts and recurring follow-up series. Schedule once, fill the room, track attendance."
      />

      <div className="mb-8">
        <GroupSeriesPlanner
          providers={providerOptions}
          viewerProviderId={viewerProvider?.id ?? null}
        />
      </div>

      <div className="mb-3 flex items-baseline justify-between">
        <Eyebrow>Active series</Eyebrow>
        <p className="text-xs text-text-subtle">{seriesList.length} series · next 60 days</p>
      </div>

      {seriesList.length === 0 ? (
        <EmptyState
          title="No group visits scheduled"
          description="Compose a new series above to invite multiple patients to the same cohort or recurring check-in."
        />
      ) : (
        <div className="space-y-4">
          {seriesList.map((s) => (
            <SeriesCard key={s.seriesKey} series={s} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

interface GroupSeriesView {
  seriesKey: string;
  title: string;
  cadence: "once" | "weekly" | "biweekly" | "monthly";
  topic: string | null;
  provider: string;
  sessions: Array<{
    startAt: Date;
    endAt: Date;
    attendees: Array<{
      patientId: string;
      firstName: string;
      lastName: string;
      status: string;
    }>;
  }>;
}

function SeriesCard({ series }: { series: GroupSeriesView }) {
  const totalSeats = series.sessions.reduce((s, x) => s + x.attendees.length, 0);
  const completed = series.sessions
    .flatMap((s) => s.attendees)
    .filter((a) => a.status === "completed").length;
  const attendanceRate = totalSeats === 0 ? 0 : completed / totalSeats;

  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-display text-lg text-text">{series.title}</h3>
              <Badge tone={series.cadence === "once" ? "neutral" : "accent"}>{series.cadence}</Badge>
            </div>
            {series.topic && (
              <p className="text-sm text-text-muted">{series.topic}</p>
            )}
            <p className="text-[11px] text-text-subtle uppercase tracking-wider mt-1">
              Led by {series.provider}
            </p>
          </div>
          <div className="text-right">
            <p className="font-display text-2xl text-accent tabular-nums">
              {Math.round(attendanceRate * 100)}%
            </p>
            <p className="text-[10px] text-text-subtle uppercase tracking-wider">attendance</p>
          </div>
        </div>
        <div className="space-y-2">
          {series.sessions.map((session, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between border border-border/60 rounded-lg px-3 py-2"
            >
              <div>
                <p className="text-sm text-text font-medium">
                  {session.startAt.toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </p>
                <p className="text-[11px] text-text-subtle tabular-nums">
                  {session.startAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                  {" – "}
                  {session.endAt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                </p>
              </div>
              <div className="flex -space-x-2">
                {session.attendees.slice(0, 5).map((a) => (
                  <Avatar
                    key={a.patientId}
                    firstName={a.firstName}
                    lastName={a.lastName}
                    size="sm"
                    className="ring-2 ring-surface"
                  />
                ))}
                {session.attendees.length > 5 && (
                  <span className="h-7 w-7 rounded-full bg-surface-muted ring-2 ring-surface text-[10px] flex items-center justify-center text-text-muted tabular-nums">
                    +{session.attendees.length - 5}
                  </span>
                )}
                {session.attendees.length === 0 && (
                  <span className="text-[11px] text-text-subtle italic">No attendees yet</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

interface SeriesHeader {
  seriesKey: string;
  title: string;
  cadence: "once" | "weekly" | "biweekly" | "monthly";
  topic: string | null;
}

/**
 * Notes column convention for group/recurring visits:
 *
 *   #group{"k":"<key>","t":"<title>","c":"weekly","topic":"…"}
 *   …rest of notes…
 *
 * Survives migrations and avoids needing a new column.
 */
function parseSeriesHeader(notes: string | null): SeriesHeader | null {
  if (!notes) return null;
  const match = notes.match(/^#group(\{.*?\})/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]) as Record<string, unknown>;
    if (typeof parsed.k !== "string" || typeof parsed.t !== "string") return null;
    const cadence = parsed.c;
    if (cadence !== "once" && cadence !== "weekly" && cadence !== "biweekly" && cadence !== "monthly") {
      return null;
    }
    return {
      seriesKey: parsed.k,
      title: parsed.t,
      cadence,
      topic: typeof parsed.topic === "string" ? parsed.topic : null,
    };
  } catch {
    return null;
  }
}
