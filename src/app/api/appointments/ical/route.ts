import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { buildIcs, type IcsEvent } from "@/lib/domain/ical";

/**
 * Returns an iCalendar (.ics) file containing the signed-in patient's
 * upcoming + recent appointments.
 *
 * Patients can subscribe their iCal/Google Calendar to this URL OR
 * download the file as a one-shot import. Both work.
 *
 * The endpoint requires authentication — sessions are cookie-based,
 * so this works for direct browser downloads but NOT for calendar
 * subscription URLs (those would need a per-patient signed token,
 * which is a future enhancement).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Find the patient profile for this user
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, firstName: true, lastName: true, organizationId: true },
  });

  if (!patient) {
    return NextResponse.json({ error: "no patient profile" }, { status: 404 });
  }

  // Pull all appointments from 30 days ago through 1 year out
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const appointments = await prisma.appointment.findMany({
    where: {
      patientId: patient.id,
      startAt: { gte: thirtyDaysAgo },
      status: { notIn: ["cancelled"] },
    },
    include: {
      provider: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { startAt: "asc" },
  });

  const events: IcsEvent[] = appointments.map((appt) => {
    const providerName = appt.provider
      ? `${appt.provider.user.firstName} ${appt.provider.user.lastName}`
      : "Your care team";

    const modalityLabel =
      appt.modality === "video"
        ? "Video visit"
        : appt.modality === "phone"
          ? "Phone visit"
          : "In-person visit";

    return {
      uid: `appt-${appt.id}@leafjourney.com`,
      start: appt.startAt,
      end: appt.endAt,
      summary: `${modalityLabel} with ${providerName}`,
      description:
        `Your appointment with ${providerName}.\n\n` +
        `Modality: ${modalityLabel}\n` +
        `Status: ${appt.status}\n` +
        (appt.notes ? `Notes: ${appt.notes}\n` : "") +
        `\nView in Leafjourney: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://leafjourney.com"}/portal`,
      location: appt.modality === "in_person" ? "Leafjourney Clinic" : undefined,
    };
  });

  const ics = buildIcs(events, {
    calendarName: `${patient.firstName}'s Leafjourney Appointments`,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="leafjourney-appointments.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
