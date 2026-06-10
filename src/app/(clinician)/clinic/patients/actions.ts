"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { ForbiddenError, requirePermission } from "@/lib/rbac/permissions";
import { patientMatchesQuery } from "@/lib/search/patient-search";

const emergencyContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  relationship: z.string().min(1, "Relationship is required"),
  phone: z.string().min(1, "Phone is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});

const createPatientSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  addressLine1: z.string().optional().or(z.literal("")),
  addressLine2: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  state: z.string().optional().or(z.literal("")),
  postalCode: z.string().optional().or(z.literal("")),
  sex: z.string().optional().or(z.literal("")),
  race: z.string().optional().or(z.literal("")),
  maritalStatus: z.string().optional().or(z.literal("")),
  photoUrl: z.string().optional().or(z.literal("")),
  emergencyContacts: z.array(emergencyContactSchema).min(1, "At least one emergency contact is required"),
  insurance: z.object({
    providerName: z.string().min(1, "Provider name is required"),
    memberId: z.string().min(1, "Member ID is required"),
    groupNumber: z.string().optional().or(z.literal("")),
  }).optional(),
});

export type CreatePatientResult = { ok: true; patientId: string } | { ok: false; error: string };

export async function createPatientAction(
  data: z.infer<typeof createPatientSchema>
): Promise<CreatePatientResult> {
  const user = await requireUser();
  const orgId = user.organizationId!;

  // EMR-1111 (FO-M4) — previously ungated: any authenticated user could
  // create a patient row. Creating a chart is a demographics-edit power,
  // so gate it on the matrix permission (front office holds it by design).
  try {
    requirePermission(user, "patient.demographics.edit");
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "You don't have permission to create patients." };
    }
    throw err;
  }

  const parsed = createPatientSchema.safeParse(data);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return { ok: false, error: firstError?.message ?? "Invalid input." };
  }

  const payload = parsed.data;

  // Create the patient in active status
  const patient = await prisma.patient.create({
    data: {
      organizationId: orgId,
      status: "active",
      firstName: payload.firstName,
      lastName: payload.lastName,
      dateOfBirth: new Date(payload.dateOfBirth),
      phone: payload.phone || null,
      email: payload.email || null,
      addressLine1: payload.addressLine1 || null,
      addressLine2: payload.addressLine2 || null,
      city: payload.city || null,
      state: payload.state || null,
      postalCode: payload.postalCode || null,
      intakeAnswers: {
        sex: payload.sex || undefined,
        race: payload.race || undefined,
        maritalStatus: payload.maritalStatus || undefined,
        photoUrl: payload.photoUrl || undefined,
        emergencyContacts: payload.emergencyContacts,
        insurance: payload.insurance || undefined,
      } as any,
    },
  });

  // Audit trail creation
  await prisma.auditLog.create({
    data: {
      organizationId: orgId,
      actorUserId: user.id,
      action: "patient.created",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: {
        firstName: payload.firstName,
        lastName: payload.lastName,
      },
    },
  });

  revalidatePath("/clinic/patients");
  return { ok: true, patientId: patient.id };
}

export async function searchPatientsAction(query: string) {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const patients = await prisma.patient.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      // Exclude the reserved internal record that anchors calendar blocks —
      // it is not a real patient and must never be selectable in patient search.
      NOT: { firstName: "System", lastName: "CalendarBlock" },
    },
    include: {
      appointments: {
        where: { status: "confirmed" },
        orderBy: { startAt: "desc" },
        take: 1,
      },
    },
  });

  const matches = patients.filter((p) => {
    const searchable = {
      firstName: p.firstName,
      lastName: p.lastName,
      dob: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
      phone: p.phone,
    };
    return patientMatchesQuery(searchable, query);
  });

  return matches.map((p) => ({
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    dob: p.dateOfBirth ? p.dateOfBirth.toISOString().slice(0, 10) : null,
    phone: p.phone,
    email: p.email,
    addressLine1: p.addressLine1,
    addressLine2: p.addressLine2,
    city: p.city,
    state: p.state,
    postalCode: p.postalCode,
    lastVisit: p.appointments[0]?.startAt ? p.appointments[0].startAt.toISOString() : null,
    intakeAnswers: p.intakeAnswers,
  }));
}

export async function checkDuplicateAppointmentAction(patientId: string) {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 7);

  const existing = await prisma.appointment.findFirst({
    where: {
      patientId,
      status: "confirmed",
      startAt: {
        gte: startOfWeek,
        lt: endOfWeek,
      },
    },
    orderBy: { startAt: "asc" },
  });

  if (existing) {
    return {
      hasDuplicate: true,
      scheduledAt: existing.startAt.toISOString(),
    };
  }

  return { hasDuplicate: false };
}
