"use server";

// EMR-1114 (PJ-2 / PJ-B2) — persist portal consent signatures.
// Pattern follows the registration packet (portal/registration/actions.ts):
// requireUser → resolve the patient org-scoped by userId → write → audit → revalidate.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { DEFAULT_TEMPLATES } from "@/lib/domain/consent-forms";
import { equivalentTemplateIds } from "./consent-aliases";

const schema = z.object({
  templateId: z.string().min(1).max(100),
  // Field responses keyed by field id. The signature image travels separately
  // in signatureData; client replaces the signature field value with `true`.
  responses: z.record(z.union([z.string().max(10_000), z.boolean()])),
  // Base64 data-URL from the signature canvas.
  signatureData: z.string().max(500_000).optional(),
});

export type SignedConsentSummary = {
  id: string;
  templateId: string;
  templateName: string;
  signedAt: string; // ISO
};

export type SignConsentResult =
  | { ok: true; consent: SignedConsentSummary; alreadySigned: boolean }
  | { ok: false; error: string };

function summarize(row: {
  id: string;
  templateId: string;
  templateName: string;
  signedAt: Date;
}): SignedConsentSummary {
  return {
    id: row.id,
    templateId: row.templateId,
    templateName: row.templateName,
    signedAt: row.signedAt.toISOString(),
  };
}

export async function signConsent(input: {
  templateId: string;
  responses: Record<string, string | boolean>;
  signatureData?: string;
}): Promise<SignConsentResult> {
  const user = await requireUser();

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid consent submission." };

  const template = DEFAULT_TEMPLATES.find((t) => t.id === parsed.data.templateId);
  if (!template) return { ok: false, error: "Unknown consent form." };

  // Patient is resolved strictly from the signed-in user — a patient can only
  // ever sign for their own record.
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, organizationId: true },
  });
  if (!patient) return { ok: false, error: "No patient profile found." };

  // Required acknowledgments + signature must be present server-side too.
  for (const field of template.fields) {
    if (!field.required || field.type === "paragraph") continue;
    if (field.type === "signature") {
      if (!parsed.data.signatureData) {
        return { ok: false, error: "A signature is required." };
      }
      continue;
    }
    const val = parsed.data.responses[field.id];
    if (field.type === "acknowledgment" ? val !== true : !val) {
      return { ok: false, error: `"${field.label}" is required.` };
    }
  }

  // Dedupe — a consent signed during registration (reg-*) or previously on the
  // portal satisfies this template. Return the existing row instead of
  // inviting a duplicate signature.
  const existing = await prisma.signedConsent.findFirst({
    where: {
      patientId: patient.id,
      templateId: { in: equivalentTemplateIds(template.id) },
    },
    orderBy: { signedAt: "asc" },
    select: { id: true, templateId: true, templateName: true, signedAt: true },
  });
  if (existing) {
    return { ok: true, consent: summarize(existing), alreadySigned: true };
  }

  const created = await prisma.signedConsent.create({
    data: {
      patientId: patient.id,
      templateId: template.id,
      templateName: template.name,
      version: template.version,
      responses: parsed.data.responses as unknown as object,
      signatureData: parsed.data.signatureData || null,
    },
    select: { id: true, templateId: true, templateName: true, signedAt: true },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "patient.consent.signed",
      subjectType: "SignedConsent",
      subjectId: created.id,
      metadata: {
        templateId: template.id,
        templateName: template.name,
        version: template.version,
        via: "portal_consent",
      },
    },
  });

  revalidatePath("/portal/consent");
  revalidatePath("/portal");

  return { ok: true, consent: summarize(created), alreadySigned: false };
}
