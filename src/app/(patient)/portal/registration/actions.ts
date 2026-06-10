"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";

// EMR-489 — submit the new-patient digital registration packet.
const schema = z.object({
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  dateOfBirth: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(50).optional(),
  postalCode: z.string().max(20).optional(),
  insurancePayer: z.string().max(120).optional(),
  memberId: z.string().max(80).optional(),
  selfPay: z.string().optional(),
  treatmentConsent: z.string().optional(),
  telehealthConsent: z.string().optional(),
  privacyConsent: z.string().optional(),
});

const FIELDS = [
  "firstName",
  "lastName",
  "dateOfBirth",
  "email",
  "phone",
  "addressLine1",
  "city",
  "state",
  "postalCode",
  "insurancePayer",
  "memberId",
  "selfPay",
  "treatmentConsent",
  "telehealthConsent",
  "privacyConsent",
] as const;

export type RegistrationResult = { ok: true } | { ok: false; error: string };

export async function submitRegistrationPacket(
  _prev: RegistrationResult | null,
  formData: FormData,
): Promise<RegistrationResult> {
  const user = await requireRole("patient");

  const raw: Record<string, string> = {};
  for (const k of FIELDS) raw[k] = (formData.get(k) as string) ?? "";

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.errors[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  // Consent + insurance gates.
  if (d.treatmentConsent !== "true" || d.privacyConsent !== "true") {
    return {
      ok: false,
      error: "Treatment and privacy consents are required to complete registration.",
    };
  }
  const isSelfPay = d.selfPay === "true";
  if (!isSelfPay && (!d.insurancePayer || !d.memberId)) {
    return { ok: false, error: "Enter insurance details or choose self-pay." };
  }

  const patient = await prisma.patient.findUnique({ where: { userId: user.id } });
  if (!patient) return { ok: false, error: "No patient profile found." };

  const existingIntake = (patient.intakeAnswers as Record<string, unknown>) ?? {};
  const updatedIntake = {
    ...existingIntake,
    insurancePayer: isSelfPay ? undefined : d.insurancePayer,
    insuranceMemberId: isSelfPay ? undefined : d.memberId,
    selfPay: isSelfPay,
    registrationCompletedAt: new Date().toISOString(),
  };

  const consents: Array<{ id: string; name: string }> = [
    { id: "reg-treatment", name: "Treatment Consent" },
    { id: "reg-privacy", name: "Notice of Privacy Practices" },
  ];
  if (d.telehealthConsent === "true") {
    consents.push({ id: "reg-telehealth", name: "Telehealth Consent" });
  }

  await prisma.$transaction([
    prisma.patient.update({
      where: { id: patient.id },
      data: {
        firstName: d.firstName,
        lastName: d.lastName,
        dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : undefined,
        email: d.email || null,
        phone: d.phone || null,
        addressLine1: d.addressLine1 || null,
        city: d.city || null,
        state: d.state || null,
        postalCode: d.postalCode || null,
        intakeAnswers: updatedIntake as unknown as object,
      },
    }),
    ...consents.map((c) =>
      prisma.signedConsent.create({
        data: {
          patientId: patient.id,
          templateId: c.id,
          templateName: c.name,
          version: "1.0",
          responses: { acknowledged: true, via: "registration_packet" } as unknown as object,
        },
      }),
    ),
    prisma.auditLog.create({
      data: {
        organizationId: patient.organizationId,
        actorUserId: user.id,
        action: "patient.registration.completed",
        subjectType: "Patient",
        subjectId: patient.id,
        metadata: { selfPay: isSelfPay, consents: consents.map((c) => c.id) },
      },
    }),
  ]);

  revalidatePath("/portal");
  revalidatePath("/portal/registration");
  return { ok: true };
}
