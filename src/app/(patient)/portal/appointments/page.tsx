import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AppointmentsCalendar } from "./appointments-calendar";
import type { CalendarEvent } from "@/components/ui/calendar";
import {
  DEFAULT_TIME_ZONE,
  getLocalDayBounds,
  sameLocalDay,
} from "@/lib/utils/timezone";

export const metadata = { title: "Appointments" };

// Encounter states that mean "the clinic knows you're here" (EMR-1115 / PJ-M8).
const CHECKED_IN_STATES = new Set([
  "checked_in",
  "info_incomplete",
  "ready",
  "rooming",
  "roomed",
]);
const IN_VISIT_STATES = new Set(["in_visit", "in_progress", "wrap_up"]);

/** Pull the patient join URL persisted by startTelehealthVisit (briefingContext.telehealth). */
function readJoinUrl(briefingContext: unknown): string | null {
  if (!briefingContext || typeof briefingContext !== "object") return null;
  const telehealth = (briefingContext as Record<string, unknown>).telehealth;
  if (!telehealth || typeof telehealth !== "object") return null;
  const url = (telehealth as Record<string, unknown>).patientJoinUrl;
  return typeof url === "string" && url.startsWith("https://") ? url : null;
}

export default async function PortalAppointmentsPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findFirst({
    where: { userId: user.id, deletedAt: null },
    include: { organization: { select: { timeZone: true } } },
  });
  if (!patient) redirect("/portal/intake");

  const timeZone = patient.organization?.timeZone || DEFAULT_TIME_ZONE;

  // Pull a generous window so month/week navigation has data.
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - 14);
  const windowEnd = new Date(now);
  windowEnd.setDate(windowEnd.getDate() + 60);

  const appointments = await prisma.appointment.findMany({
    where: {
      patientId: patient.id,
      startAt: { gte: windowStart, lt: windowEnd },
    },
    orderBy: { startAt: "asc" },
    include: {
      provider: {
        select: {
          title: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
      // Encounter check-in state + the telehealth join link persisted by
      // startTelehealthVisit (briefingContext.telehealth.patientJoinUrl).
      encounter: { select: { status: true, briefingContext: true } },
    },
  });

  const { startOfDay } = getLocalDayBounds(timeZone, now);

  // Today + upcoming visits get a card above the calendar (cancelled ones
  // included, so the cancellation is visible — PJ minor #4).
  const visitCards = appointments.filter((a) => a.endAt >= startOfDay);

  // Cancellation reasons live on the audit trail (Appointment has no reason
  // column). Surface them to the patient on their own cancelled cards.
  const cancelledIds = visitCards
    .filter((a) => a.status === "cancelled")
    .map((a) => a.id);
  const reasonByAppointment = new Map<string, string>();
  if (cancelledIds.length > 0) {
    const auditRows = await prisma.auditLog.findMany({
      where: {
        action: "appointment.cancelled",
        subjectType: "Appointment",
        subjectId: { in: cancelledIds },
      },
      orderBy: { createdAt: "asc" },
      select: { subjectId: true, metadata: true },
    });
    for (const row of auditRows) {
      const meta = row.metadata as { reason?: unknown } | null;
      if (row.subjectId && typeof meta?.reason === "string" && meta.reason.trim()) {
        // asc order → later rows win, leaving the most recent reason.
        reasonByAppointment.set(row.subjectId, meta.reason.trim());
      }
    }
  }

  const providerNameOf = (a: (typeof appointments)[number]) =>
    a.provider?.user
      ? `${a.provider.title ?? ""} ${a.provider.user.firstName ?? ""} ${a.provider.user.lastName ?? ""}`
          .replace(/\s+/g, " ")
          .trim()
      : "Your care team";

  const events: CalendarEvent[] = appointments.map((a) => ({
    id: a.id,
    start: a.startAt.toISOString(),
    end: a.endAt.toISOString(),
    title: a.provider?.user ? providerNameOf(a) : "Visit",
    description: a.notes ?? undefined,
    color:
      a.status === "cancelled" || a.status === "no_show"
        ? "danger"
        : a.status === "confirmed"
          ? "accent"
          : "info",
  }));

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Appointments"
        title="Your visits"
        description="See upcoming and recent appointments at a glance."
        actions={
          <Link
            href="/portal/schedule"
            className="inline-flex h-9 items-center rounded-md bg-accent px-3 text-xs font-semibold text-accent-ink hover:bg-accent-hover transition-colors"
          >
            Book new visit
          </Link>
        }
      />

      {visitCards.length > 0 && (
        <section className="mb-8 space-y-3">
          <p className="text-sm font-medium text-text">Today &amp; upcoming</p>
          {visitCards.map((a) => {
            const cancelled = a.status === "cancelled";
            const isToday = sameLocalDay(a.startAt, now, timeZone);
            const encStatus = a.encounter?.status ?? null;
            const joinUrl =
              a.modality === "video" && !cancelled && a.status !== "no_show"
                ? readJoinUrl(a.encounter?.briefingContext)
                : null;
            const reason = cancelled ? reasonByAppointment.get(a.id) : undefined;

            const when = a.startAt.toLocaleString("en-US", {
              timeZone,
              weekday: "long",
              month: "long",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            });

            return (
              <Card
                key={a.id}
                tone="raised"
                className={cancelled ? "rounded-2xl opacity-80" : "rounded-2xl"}
              >
                <CardContent className="py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text">
                        {when}
                        {isToday && !cancelled && (
                          <span className="ml-2 text-[11px] font-semibold text-accent uppercase tracking-wide">
                            Today
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-text-muted mt-0.5">
                        {providerNameOf(a)} ·{" "}
                        {a.modality === "video"
                          ? "Video visit"
                          : a.modality === "phone"
                            ? "Phone visit"
                            : "In person"}
                      </p>
                      {cancelled && reason && (
                        <p className="text-xs text-text-muted mt-1">
                          Reason: {reason}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {cancelled ? (
                        <Badge tone="danger">Cancelled</Badge>
                      ) : encStatus && IN_VISIT_STATES.has(encStatus) ? (
                        <Badge tone="info">Your visit is in progress</Badge>
                      ) : encStatus && CHECKED_IN_STATES.has(encStatus) ? (
                        <Badge tone="success">
                          You&rsquo;re checked in — the team knows you&rsquo;re here
                        </Badge>
                      ) : a.status === "confirmed" ? (
                        <Badge tone="accent">Confirmed</Badge>
                      ) : (
                        <Badge tone="info">Requested</Badge>
                      )}

                      {joinUrl && (
                        <a
                          href={joinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-9 items-center rounded-md bg-accent px-4 text-xs font-semibold text-accent-ink hover:bg-accent-hover transition-colors"
                        >
                          Join video visit
                        </a>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {events.length === 0 ? (
        <EmptyState
          title="No appointments yet"
          description="Once you book a visit it will show up on the calendar here."
        />
      ) : (
        <AppointmentsCalendar events={events} />
      )}
    </PageShell>
  );
}
