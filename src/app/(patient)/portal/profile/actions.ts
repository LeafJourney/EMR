"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";

const schema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  dateOfBirth: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  // Stored in intakeAnswers JSON
  sex: z.string().max(50).optional(),
  race: z.string().max(100).optional(),
  maritalStatus: z.string().max(50).optional(),
  uniqueThing: z.string().max(500).optional(),
});

export type ProfileResult = { ok: true } | { ok: false; error: string };

export async function saveProfileAction(
  _prev: ProfileResult | null,
  formData: FormData,
): Promise<ProfileResult> {
  const user = await requireRole("patient");

  const raw: Record<string, string> = {};
  for (const key of [
    "firstName",
    "lastName",
    "dateOfBirth",
    "email",
    "phone",
    "addressLine1",
    "addressLine2",
    "city",
    "state",
    "postalCode",
    "sex",
    "race",
    "maritalStatus",
    "uniqueThing",
  ]) {
    raw[key] = (formData.get(key) as string) ?? "";
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const firstError = parsed.error.errors[0];
    return { ok: false, error: firstError?.message ?? "Invalid input." };
  }

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });
  if (!patient) return { ok: false, error: "No patient profile found." };

  // Merge new fields into existing intakeAnswers
  const existingIntake =
    (patient.intakeAnswers as Record<string, unknown>) ?? {};
  const updatedIntake = {
    ...existingIntake,
    sex: parsed.data.sex || undefined,
    race: parsed.data.race || undefined,
    maritalStatus: parsed.data.maritalStatus || undefined,
    uniqueThing: parsed.data.uniqueThing || undefined,
  };

  await prisma.patient.update({
    where: { id: patient.id },
    data: {
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      dateOfBirth: parsed.data.dateOfBirth
        ? new Date(parsed.data.dateOfBirth)
        : undefined,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      addressLine1: parsed.data.addressLine1 || null,
      addressLine2: parsed.data.addressLine2 || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      postalCode: parsed.data.postalCode || null,
      intakeAnswers: updatedIntake as any,
    },
  });

  // Audit trail: log every patient profile change (P1-9)
  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "patient.profile.updated",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: {
        changedFields: Object.keys(parsed.data).filter(
          (k) => parsed.data[k as keyof typeof parsed.data] !== undefined,
        ),
      },
    },
  });

  revalidatePath("/portal/profile");
  revalidatePath("/portal");

  return { ok: true };
}

export async function savePatientPortalPhoto(base64Data: string) {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });
  if (!patient) throw new Error("No patient profile found.");

  const intake = (patient.intakeAnswers as Record<string, any>) ?? {};
  const updatedIntake = { ...intake, photoUrl: base64Data };

  await prisma.patient.update({
    where: { id: patient.id },
    data: { intakeAnswers: updatedIntake as any },
  });

  revalidatePath("/portal/profile");
  revalidatePath("/portal");
  revalidatePath(`/clinic/patients/${patient.id}`);
  return { ok: true };
}

