import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { ScheduleCalendar, type AppointmentDTO } from "./schedule-calendar";

export const metadata = { title: "Schedule" };

export default async function ClinicianSchedulePage({
  searchParams,
}: {
  searchParams: { week?: string; view?: string; patient?: string; patientId?: string };
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

  // EMR-1112 (FO-5) — outstanding balance + copay per patient on the week,
  // derived the same way the financial cockpit's "Patient due" is
  // (getPatientFinancialSummary): open statements' amountDue minus paidToDate.
  // Batched across the week's patients so the popover chip is free to render.
  const patientIds = Array.from(new Set(appointments.map((a) => a.patientId)));
  const [openStatements, coverages] = await Promise.all([
    prisma.statement.findMany({
      where: {
        patientId: { in: patientIds },
        status: { notIn: ["paid", "voided"] },
      },
      select: { patientId: true, amountDueCents: true, paidToDateCents: true },
    }),
    prisma.patientCoverage.findMany({
      where: { patientId: { in: patientIds }, type: "primary", active: true },
      select: { patientId: true, copayCents: true },
    }),
  ]);

  const balanceByPatient = new Map<string, number>();
  for (const s of openStatements) {
    balanceByPatient.set(
      s.patientId,
      (balanceByPatient.get(s.patientId) ?? 0) + (s.amountDueCents - s.paidToDateCents),
    );
  }
  const copayByPatient = new Map<string, number | null>();
  for (const c of coverages) copayByPatient.set(c.patientId, c.copayCents);

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
    balanceDueCents: Math.max(0, balanceByPatient.get(a.patientId) ?? 0),
    copayCents: copayByPatient.get(a.patientId) ?? null,
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
        patientId={searchParams.patient || searchParams.patientId}
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
