"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  encryptTaxId,
  isValidEin,
  isValidNpi,
  isValidTaxonomy,
  normalizeNpi,
} from "@/lib/billing/identifiers";

// EMR-220 — server actions for the billing-identifiers admin page.
// Validation is server-side (NPI Luhn + EIN format) so a tampered form
// can't sneak past client checks. Every mutation writes an AuditLog row
// recording WHICH identifier fields changed — never the plaintext tax ID.

const orgFormSchema = z.object({
  billingNpi: z.string().trim(),
  taxId: z.string().trim(),
  line1: z.string().trim(),
  city: z.string().trim(),
  state: z.string().trim().length(2),
  postalCode: z.string().trim(),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function saveOrgIdentifiersAction(formData: FormData): Promise<SaveResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No org in session" };

  const parsed = orgFormSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  const v = parsed.data;

  if (v.billingNpi && !isValidNpi(v.billingNpi)) {
    return { ok: false, error: `Billing NPI "${v.billingNpi}" failed CMS Luhn checksum` };
  }
  if (v.taxId && !isValidEin(v.taxId)) {
    return { ok: false, error: `Tax ID "${v.taxId}" must match the format NN-NNNNNNN` };
  }

  const update: Record<string, unknown> = {};
  const changedFields: string[] = [];
  if (v.billingNpi) {
    update.billingNpi = normalizeNpi(v.billingNpi);
    changedFields.push("billingNpi");
  }
  if (v.taxId) {
    update.taxId = encryptTaxId(v.taxId);
    changedFields.push("taxId");
  }
  if (v.line1 && v.city && v.state && v.postalCode) {
    update.billingAddress = {
      line1: v.line1,
      city: v.city,
      state: v.state.toUpperCase(),
      postalCode: v.postalCode.replace(/\D/g, ""),
    };
    changedFields.push("billingAddress");
  }

  if (Object.keys(update).length === 0) {
    return { ok: false, error: "No changes to save." };
  }

  await prisma.organization.update({
    where: { id: user.organizationId },
    data: update,
  });

  // Audit trail — record which identifier fields changed. The encrypted tax
  // ID is sensitive (effectively a credential), so we log only that it was
  // rotated, never the value.
  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "billing.identifiers.org_updated",
      subjectType: "Organization",
      subjectId: user.organizationId,
      metadata: { changedFields },
    },
  });

  revalidatePath("/ops/billing/identifiers");
  return { ok: true };
}

const providerFormSchema = z.object({
  providerId: z.string().min(1),
  npi: z.string().trim(),
  taxonomyCode: z.string().trim(),
});

export async function saveProviderIdentifierAction(formData: FormData): Promise<SaveResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No org in session" };

  const parsed = providerFormSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };

  if (parsed.data.npi && !isValidNpi(parsed.data.npi)) {
    return { ok: false, error: `NPI "${parsed.data.npi}" failed CMS Luhn checksum` };
  }
  if (parsed.data.taxonomyCode && !isValidTaxonomy(parsed.data.taxonomyCode)) {
    return { ok: false, error: `Taxonomy "${parsed.data.taxonomyCode}" must be 10 alphanumeric characters` };
  }

  const provider = await prisma.provider.findFirst({
    where: { id: parsed.data.providerId, organizationId: user.organizationId },
  });
  if (!provider) return { ok: false, error: "Provider not found in this organization" };

  await prisma.provider.update({
    where: { id: provider.id },
    data: {
      npi: parsed.data.npi ? normalizeNpi(parsed.data.npi) : null,
      taxonomyCode: parsed.data.taxonomyCode ? parsed.data.taxonomyCode.toUpperCase() : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "billing.identifiers.provider_updated",
      subjectType: "Provider",
      subjectId: provider.id,
      metadata: {
        npiSet: !!parsed.data.npi,
        taxonomySet: !!parsed.data.taxonomyCode,
      },
    },
  });

  revalidatePath("/ops/billing/identifiers");
  return { ok: true };
}
