"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser, type AuthedUser } from "@/lib/auth/session";

const VisitTypeSchema = z.enum(["new_patient", "follow_up", "renewal", "in_person"]);

// EMR-1110 (FO-M2) — staff roles allowed to book on a patient's behalf by
// passing an explicit patientId. Matches the scheduling allowlist used by
// the schedule actions (QUEUE_STATE_ROLES style).
const STAFF_BOOKING_ROLES = new Set([
  "front_office",
  "back_office",
  "clinician",
  "practice_owner",
  "operator",
]);

function isBookingStaff(user: AuthedUser): boolean {
  return user.roles.some((role) => STAFF_BOOKING_ROLES.has(role));
}

const ConfirmBookingSchema = z.object({
  visitTypeId: VisitTypeSchema,
  durationMinutes: z.number().int().min(10).max(120),
  modality: z.enum(["video", "in_person"]),
  providerId: z.string().nullable(),
  slotStartIso: z.string(),
  // Staff-only: book on this patient's behalf. Omitted in the self-serve
  // (patient) flow, which resolves the patient from the session user.
  patientId: z.string().min(1).optional(),
  insurance: z.discriminatedUnion("selfPay", [
    z.object({ selfPay: z.literal(true) }),
    z.object({
      selfPay: z.literal(false),
      payer: z.string().min(1),
      memberId: z.string().min(1),
      notes: z.string().optional(),
    }),
  ]),
});

export type ConfirmBookingInput = z.infer<typeof ConfirmBookingSchema>;

type ConfirmBookingResult =
  | {
      ok: true;
      appointmentId: string;
      icsDataUrl: string;
      icsFileName: string;
    }
  | { ok: false; error: string };

/**
 * Create the appointment, write a stub insurance pre-screen note onto the
 * patient, and return an ICS data URL the client can offer as a download.
 *
 * The ICS is generated inline so we don't need to hit the file storage
 * pipeline for a calendar invite — the client just downloads the data URL.
 */
export async function confirmBookingAction(input: ConfirmBookingInput): Promise<ConfirmBookingResult> {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) return { ok: false, error: "No organization on session." };

  const parsed = ConfirmBookingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid booking details." };
  const data = parsed.data;

  const start = new Date(data.slotStartIso);
  if (Number.isNaN(start.getTime())) return { ok: false, error: "Invalid slot." };
  const end = new Date(start.getTime() + data.durationMinutes * 60_000);

  // Resolve the patient.
  //  - Staff path (EMR-1110 / FO-M2): an explicit patientId books on that
  //    patient's behalf — allowed only for STAFF_BOOKING_ROLES, org-scoped.
  //  - Self-serve path (unchanged): no patientId — the booking lands on the
  //    current user's own patient record (patient portal behavior).
  const onBehalf = !!data.patientId;
  let patient: { id: string; firstName: string; lastName: string } | null;
  if (data.patientId) {
    if (!isBookingStaff(user)) {
      return { ok: false, error: "You don't have permission to book for another patient." };
    }
    patient = await prisma.patient.findFirst({
      where: { id: data.patientId, organizationId: orgId, deletedAt: null },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!patient) return { ok: false, error: "Patient not found in your organization." };
  } else {
    patient = await prisma.patient.findFirst({
      where: { organizationId: orgId, userId: user.id },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!patient) {
      return {
        ok: false,
        error: isBookingStaff(user)
          ? "Select a patient to book for — staff bookings need an explicit patient."
          : "No patient record on file. Ask the front desk to enroll you first.",
      };
    }
  }

  // Conflict check on the chosen provider — the synthetic grid pre-filters
  // booked slots, but a parallel booking may have landed since the page rendered.
  if (data.providerId) {
    const conflict = await prisma.appointment.findFirst({
      where: {
        providerId: data.providerId,
        status: { in: ["requested", "confirmed"] },
        startAt: { lt: end },
        endAt: { gt: start },
      },
    });
    if (conflict) {
      return { ok: false, error: "That slot was just taken. Please pick another." };
    }
  }

  const appt = await prisma.appointment.create({
    data: {
      patientId: patient.id,
      providerId: data.providerId,
      startAt: start,
      endAt: end,
      modality: data.modality,
      status: "requested",
      notes: buildNoteBlock(data),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: user.id,
      action: "appointment.created",
      subjectType: "Appointment",
      subjectId: appt.id,
      metadata: {
        patientId: patient.id,
        onBehalf,
        visitType: data.visitTypeId,
        slotStart: start.toISOString(),
      },
    },
  });

  revalidatePath("/clinic/schedule");
  revalidatePath("/clinic/scheduling/book");

  const icsContent = buildIcs({
    uid: appt.id,
    summary: `Leafjourney visit — ${labelVisit(data.visitTypeId)}`,
    description: data.insurance.selfPay
      ? "Self-pay visit confirmed."
      : `Insurance: ${data.insurance.payer} (${data.insurance.memberId})`,
    start,
    end,
    isVirtual: data.modality === "video",
  });
  const icsDataUrl =
    "data:text/calendar;charset=utf-8;base64," +
    Buffer.from(icsContent, "utf-8").toString("base64");

  return {
    ok: true,
    appointmentId: appt.id,
    icsDataUrl,
    icsFileName: `leafjourney-visit-${appt.id.slice(0, 8)}.ics`,
  };
}

function buildNoteBlock(data: ConfirmBookingInput): string {
  const lines = [
    `Visit type: ${labelVisit(data.visitTypeId)}`,
    `Modality: ${data.modality}`,
    data.insurance.selfPay
      ? "Insurance: self-pay"
      : `Insurance: ${data.insurance.payer} / ${data.insurance.memberId}`,
  ];
  if (!data.insurance.selfPay && data.insurance.notes) {
    lines.push(`Insurance notes: ${data.insurance.notes}`);
  }
  return lines.join("\n");
}

function labelVisit(id: ConfirmBookingInput["visitTypeId"]): string {
  switch (id) {
    case "new_patient": return "New patient evaluation";
    case "follow_up": return "Follow-up";
    case "renewal": return "Cert renewal";
    case "in_person": return "In-person";
  }
}

/**
 * Tiny RFC-5545 ICS builder. Folds long lines at 75 chars per the spec.
 * Good enough for Apple Calendar, Google, and Outlook to import.
 */
function buildIcs(args: {
  uid: string;
  summary: string;
  description: string;
  start: Date;
  end: Date;
  isVirtual: boolean;
}): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (s: string) =>
    s.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;").replace(/\n/g, "\\n");
  const fold = (line: string) => {
    if (line.length <= 75) return line;
    const chunks: string[] = [];
    let i = 0;
    while (i < line.length) {
      const chunk = line.slice(i, i + 75);
      chunks.push(i === 0 ? chunk : " " + chunk);
      i += 75;
    }
    return chunks.join("\r\n");
  };
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Leafjourney//EMR Scheduling//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${args.uid}@leafjourney.com`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(args.start)}`,
    `DTEND:${fmt(args.end)}`,
    `SUMMARY:${escape(args.summary)}`,
    `DESCRIPTION:${escape(args.description)}`,
    args.isVirtual ? "LOCATION:Virtual visit" : "LOCATION:Clinic",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n");
}
