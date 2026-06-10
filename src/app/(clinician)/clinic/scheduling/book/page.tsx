import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { Badge } from "@/components/ui/badge";
import {
  BookingFlow,
  type VisitTypeOption,
  type ProviderOption,
  type BookablePatient,
} from "./booking-flow";

// Staff roles that may pick a patient and book on their behalf — must
// match STAFF_BOOKING_ROLES in ./actions.ts.
const STAFF_BOOKING_ROLES = new Set([
  "front_office",
  "back_office",
  "clinician",
  "practice_owner",
  "operator",
]);

export const metadata = { title: "Book a Visit" };

/**
 * EMR-206 — Self-serve online scheduling.
 *
 * Public-style booking funnel surfaced inside the clinician shell so the
 * front desk can use it on a patient's behalf. Steps:
 *
 *   1. Pick visit type
 *   2. Pick a provider (or "first available")
 *   3. Pick a slot from the next 14-day availability grid
 *   4. Insurance pre-screen
 *   5. Confirm — generates an ICS attachment for the patient's calendar
 *
 * Slot generation here is deterministic and synthetic — supply will plug
 * in real provider working-hours blocks once the calendar service merges.
 */
export default async function BookVisitPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  // EMR-1110 (FO-M2) — staff get a real patient-select step so the front
  // desk can book on a patient's behalf; patient users keep the self-serve
  // flow (their own record is resolved server-side).
  const isStaff = user.roles.some((role) => STAFF_BOOKING_ROLES.has(role));

  const providers = await prisma.provider.findMany({
    where: { organizationId: orgId, active: true },
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });

  const bookablePatients: BookablePatient[] = isStaff
    ? (
        await prisma.patient.findMany({
          where: { organizationId: orgId, deletedAt: null },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            email: true,
            dateOfBirth: true,
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        })
      ).map((p) => ({
        id: p.id,
        firstName: p.firstName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
        dateOfBirthIso: p.dateOfBirth?.toISOString() ?? null,
      }))
    : [];

  // Existing appointments — used to mask out booked slots in the synthetic grid.
  const horizonStart = new Date();
  horizonStart.setHours(0, 0, 0, 0);
  const horizonEnd = new Date(horizonStart);
  horizonEnd.setDate(horizonEnd.getDate() + 14);

  const booked = await prisma.appointment.findMany({
    where: {
      patient: { organizationId: orgId },
      startAt: { gte: horizonStart, lt: horizonEnd },
      status: { in: ["requested", "confirmed"] },
    },
    select: { providerId: true, startAt: true, endAt: true },
  });

  const bookedKeys = new Set(
    booked
      .filter((b) => b.providerId)
      .map((b) => `${b.providerId}|${b.startAt.toISOString()}`),
  );

  const visitTypes: VisitTypeOption[] = [
    {
      id: "new_patient",
      label: "New patient evaluation",
      durationMinutes: 45,
      description: "First visit — full intake, qualifying conditions, treatment plan.",
      modality: "video",
      requiresInsurance: false,
    },
    {
      id: "follow_up",
      label: "Follow-up visit",
      durationMinutes: 20,
      description: "Check-in on dosing, symptoms, and side effects.",
      modality: "video",
      requiresInsurance: false,
    },
    {
      id: "renewal",
      label: "Cert renewal",
      durationMinutes: 25,
      description: "Annual recommendation renewal for state cannabis program.",
      modality: "video",
      requiresInsurance: false,
    },
    {
      id: "in_person",
      label: "In-person visit",
      durationMinutes: 30,
      description: "Required by your state, or your clinical situation.",
      modality: "in_person",
      requiresInsurance: true,
    },
  ];

  const providerOptions: ProviderOption[] = providers.map((p) => ({
    id: p.id,
    name: `${p.user.firstName} ${p.user.lastName}`.trim(),
    title: p.title ?? "Provider",
    specialties: p.specialties,
  }));

  const slotsByProvider = buildSyntheticAvailability(
    providerOptions.map((p) => p.id),
    horizonStart,
    14,
    bookedKeys,
  );

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Book a visit"
        title="Schedule with your care team"
        description="Pick a visit type, choose a provider, then a time that works. We'll send a calendar invite and a reminder before your visit."
      />

      <div className="mb-8">
        <Card tone="ambient">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <Eyebrow className="mb-2">{isStaff ? "Front desk" : "Self-serve"}</Eyebrow>
                <p className="text-sm text-text-muted leading-relaxed">
                  {isStaff ? (
                    <>
                      This is the same flow patients see at{" "}
                      <span className="font-medium text-text">leafjourney.com/book</span> — start by
                      picking the patient you're booking for.
                    </>
                  ) : (
                    <>
                      This page is the same flow patients see at{" "}
                      <span className="font-medium text-text">leafjourney.com/book</span>.
                    </>
                  )}
                </p>
              </div>
              <Badge tone="accent">14-day horizon</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <BookingFlow
        visitTypes={visitTypes}
        providers={providerOptions}
        slotsByProvider={slotsByProvider}
        horizonStartIso={horizonStart.toISOString()}
        staffMode={isStaff}
        patients={bookablePatients}
      />

      <div className="mt-12">
        <EditorialRule />
        <p className="text-xs text-text-subtle text-center mt-4">
          Need help? Call the front desk or send a secure message — we'll book for you.
        </p>
      </div>
    </PageShell>
  );
}

/**
 * Build a 14-day grid of 30-minute starting points between 9am and 5pm
 * for each provider, filtering out anything already booked. Real
 * implementation will swap this for the calendar service's availability
 * stream.
 */
function buildSyntheticAvailability(
  providerIds: string[],
  start: Date,
  days: number,
  bookedKeys: Set<string>,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const pid of providerIds) {
    const slots: string[] = [];
    for (let d = 0; d < days; d++) {
      const day = new Date(start);
      day.setDate(day.getDate() + d);
      // Skip Sundays in the synthetic grid; real prefs come from EMR-214.
      if (day.getDay() === 0) continue;
      for (let hour = 9; hour < 17; hour++) {
        for (const minute of [0, 30]) {
          const slot = new Date(day);
          slot.setHours(hour, minute, 0, 0);
          if (slot.getTime() <= Date.now()) continue;
          const iso = slot.toISOString();
          if (bookedKeys.has(`${pid}|${iso}`)) continue;
          slots.push(iso);
        }
      }
    }
    out[pid] = slots;
  }
  return out;
}
