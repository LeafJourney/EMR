import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { ScheduleCalendar, type AppointmentDTO } from "./schedule-calendar";

export const metadata = { title: "Schedule" };

export default async function ClinicianSchedulePage({
  searchParams,
}: {
  searchParams: { week?: string; view?: string };
}) {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: { timeZone: true },
  });
  const timeZone = org?.timeZone || "America/Los_Angeles";

  // Query all non-deleted patients for scheduling dropdown and autocomplete
  const patients = await prisma.patient.findMany({
    where: { organizationId: orgId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      dateOfBirth: true,
      email: true,
      addressLine1: true,
      city: true,
      state: true,
    },
  });

  const anchorDate = searchParams.week
    ? new Date(searchParams.week + "T00:00:00")
    : new Date();
  if (Number.isNaN(anchorDate.getTime())) {
    anchorDate.setTime(Date.now());
  }
  const weekStart = startOfWeek(anchorDate);
  const weekEnd = addDays(weekStart, 7);

  const appointments = await prisma.appointment.findMany({
    where: {
      patient: { organizationId: orgId },
      startAt: { gte: weekStart, lt: weekEnd },
    },
    orderBy: { startAt: "asc" },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: {
        select: {
          id: true,
          user: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  const dtos: AppointmentDTO[] = appointments.map((a) => ({
    id: a.id,
    patientId: a.patient.id,
    patientName: `${a.patient.firstName} ${a.patient.lastName}`,
    providerName: a.provider?.user
      ? `${a.provider.user.firstName ?? ""} ${a.provider.user.lastName ?? ""}`.trim()
      : null,
    startAtIso: a.startAt.toISOString(),
    endAtIso: a.endAt.toISOString(),
    status: a.status,
    modality: a.modality,
    notes: a.notes,
  }));

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <ScheduleCalendar
        weekStartIso={weekStart.toISOString()}
        appointments={dtos}
        initialView={(searchParams.view as "day" | "week" | "list") ?? "week"}
        timeZone={timeZone}
        patients={patients.map((p) => ({
          id: p.id,
          firstName: p.firstName,
          lastName: p.lastName,
          phone: p.phone,
          dateOfBirthIso: p.dateOfBirth?.toISOString() ?? null,
          email: p.email,
          address: p.addressLine1
            ? `${p.addressLine1}${p.city ? `, ${p.city}` : ""}${p.state ? ` ${p.state}` : ""}`
            : null,
        }))}
      />
    </PageShell>
  );
}

function startOfWeek(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  out.setDate(out.getDate() - out.getDay());
  return out;
}

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}
