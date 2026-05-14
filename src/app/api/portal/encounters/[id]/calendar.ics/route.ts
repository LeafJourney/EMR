import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getCurrentUser } from "@/lib/auth/session";
import { buildIcs, type IcsEvent } from "@/lib/domain/ical";

/**
 * Per-encounter ICS download — EMR-085
 *
 * Returns a single-event .ics file the patient can drop into iCal, Google
 * Calendar, or Outlook. Complements the multi-event subscription endpoint at
 * /api/appointments/ical/route.ts (which uses the legacy Appointment model);
 * the patient dashboard shows the Encounter model, so the "Add to Calendar"
 * button on the next-visit card calls this route.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, firstName: true },
  });
  if (!patient) {
    return NextResponse.json({ error: "no patient profile" }, { status: 404 });
  }

  const encounter = await prisma.encounter.findFirst({
    where: { id, patientId: patient.id },
    include: {
      provider: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
    },
  });

  if (!encounter || !encounter.scheduledFor) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const providerName = encounter.provider
    ? `${encounter.provider.user.firstName} ${encounter.provider.user.lastName}`
    : "your care team";

  const modalityLabel =
    encounter.modality === "video"
      ? "Video visit"
      : encounter.modality === "phone"
        ? "Phone visit"
        : "In-person visit";

  // 30-minute default block — encounter model has no duration field.
  const end = new Date(encounter.scheduledFor.getTime() + 30 * 60_000);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://leafjourney.com";

  const event: IcsEvent = {
    uid: `encounter-${encounter.id}@leafjourney.com`,
    start: encounter.scheduledFor,
    end,
    summary: `${modalityLabel} with ${providerName}`,
    description:
      `Your appointment with ${providerName}.\n\n` +
      `Modality: ${modalityLabel}\n` +
      (encounter.reason ? `Reason: ${encounter.reason}\n` : "") +
      `\nView in Leafjourney: ${appUrl}/portal`,
    location: encounter.modality === "in_person" ? "Leafjourney Clinic" : undefined,
    url: `${appUrl}/portal`,
  };

  const ics = buildIcs([event], {
    calendarName: `${patient.firstName}'s visit`,
  });

  return new NextResponse(ics, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `attachment; filename="leafjourney-visit-${encounter.id}.ics"`,
      "Cache-Control": "no-store",
    },
  });
}
