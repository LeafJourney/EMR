"use server";

// EMR-143 — practice-level outreach campaign actions.
//
// A campaign targets a cohort (active vs. all, optionally filtered
// by qualification status), interpolates `{{firstName}}` / `{{lastName}}`,
// and persists per-recipient delivery state. In dev we mark recipients
// as `sent` immediately; production would queue a job per recipient
// against the SMS / email provider.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

const audienceSchema = z.object({
  status: z.enum(["all", "active", "custom"]).default("active"),
  qualified: z.boolean().optional(),
  customPatientIds: z.array(z.string()).optional(),
});

// `sms_text` is the dual-channel option from EMR-707: SMS gateway + an
// in-EMR notification entry. The DB enum only knows sms/email, so we
// store it as `sms` plus `dualChannel: true` in audienceFilter JSON.
const campaignSchema = z.object({
  name: z.string().min(1).max(120),
  channel: z.enum(["sms", "email", "sms_text"]),
  bodyTemplate: z.string().min(1).max(1000),
  audience: audienceSchema,
  // Accept full ISO 8601 and the shorter datetime-local format (YYYY-MM-DDTHH:mm).
  scheduledFor: z
    .string()
    .refine((v) => !isNaN(Date.parse(v)), { message: "Invalid date/time value" })
    .optional()
    .nullable(),
  endCampaignAt: z
    .string()
    .refine((v) => !v || !isNaN(Date.parse(v)), {
      message: "Invalid end-campaign date",
    })
    .optional()
    .nullable(),
  frequency: z.string().max(60).optional().nullable(),
  sendNow: z.boolean().default(false),
});

export type CampaignResult =
  | { ok: true; campaignId: string; recipientCount: number }
  | { ok: false; error: string };

export async function createCampaignAction(
  _prev: CampaignResult | null,
  formData: FormData,
): Promise<CampaignResult> {
  const user = await requireUser();
  if (!user.organizationId) {
    return { ok: false, error: "No organization context." };
  }
  if (!user.roles.some((r) => r === "clinician" || r === "practice_owner" || r === "operator")) {
    return { ok: false, error: "You don't have permission to send broadcasts." };
  }

  let customIds: string[] = [];
  const rawIds = formData.get("customPatientIds");
  if (typeof rawIds === "string" && rawIds.length > 0) {
    try {
      const arr = JSON.parse(rawIds);
      if (Array.isArray(arr)) {
        customIds = arr.filter((v): v is string => typeof v === "string");
      }
    } catch {
      // ignore malformed list — treated as no custom selection
    }
  }

  const parsed = campaignSchema.safeParse({
    name: (formData.get("name") as string)?.trim(),
    channel: formData.get("channel"),
    bodyTemplate: (formData.get("bodyTemplate") as string)?.trim(),
    audience: {
      status: formData.get("audienceStatus") || "active",
      qualified: formData.get("audienceQualified") === "on",
      customPatientIds: customIds,
    },
    scheduledFor: (formData.get("scheduledFor") as string) || null,
    endCampaignAt: (formData.get("endCampaignAt") as string) || null,
    frequency: (formData.get("frequency") as string)?.trim() || null,
    sendNow: formData.get("sendNow") === "on",
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid campaign payload.",
    };
  }

  // Resolve audience — never include patients without a phone (sms/sms_text)
  // or email. `custom` honors the explicit patient list from the builder.
  const where: Prisma.PatientWhereInput = {
    organizationId: user.organizationId,
    deletedAt: null,
  };
  const isDual = parsed.data.channel === "sms_text";
  const effectiveChannel: "sms" | "email" =
    parsed.data.channel === "email" ? "email" : "sms";

  if (parsed.data.audience.status === "active") {
    where.status = "active";
  }
  if (parsed.data.audience.status === "custom") {
    const ids = parsed.data.audience.customPatientIds ?? [];
    if (ids.length === 0) {
      return {
        ok: false,
        error: "Custom audience selected but the patient list is empty.",
      };
    }
    where.id = { in: ids };
  }
  if (parsed.data.audience.qualified) {
    where.qualificationStatus = "qualified";
  }
  if (effectiveChannel === "sms") {
    where.phone = { not: null };
  } else {
    where.email = { not: null };
  }

  const patients = await prisma.patient.findMany({
    where,
    select: { id: true },
    take: 5000,
  });

  if (patients.length === 0) {
    return { ok: false, error: "Audience filter matched zero patients." };
  }

  const isImmediate = parsed.data.sendNow;
  const status = isImmediate ? "sending" : "scheduled";

  const audienceFilter = {
    ...parsed.data.audience,
    dualChannel: isDual,
    frequency: parsed.data.frequency ?? null,
    endCampaignAt: parsed.data.endCampaignAt ?? null,
  };

  const campaign = await prisma.outreachCampaign.create({
    data: {
      organizationId: user.organizationId,
      name: parsed.data.name,
      channel: effectiveChannel,
      bodyTemplate: parsed.data.bodyTemplate,
      audienceFilter,
      status,
      scheduledFor: parsed.data.scheduledFor
        ? new Date(parsed.data.scheduledFor)
        : null,
      createdById: user.id,
      startedAt: isImmediate ? new Date() : null,
      recipients: {
        create: patients.map((p) => ({
          patientId: p.id,
          status: "pending",
        })),
      },
    },
    select: { id: true },
  });

  // Dev-mode "send" — mark every recipient as sent. Production would
  // hand each row to a queued job that calls the SMS / email provider.
  if (isImmediate) {
    const now = new Date();
    await prisma.$transaction([
      prisma.outreachRecipient.updateMany({
        where: { campaignId: campaign.id },
        data: { status: "sent", sentAt: now },
      }),
      prisma.outreachCampaign.update({
        where: { id: campaign.id },
        data: { status: "completed", completedAt: now },
      }),
    ]);
  }

  revalidatePath("/clinic/communications");
  revalidatePath("/clinic/communications/broadcasts");
  return {
    ok: true,
    campaignId: campaign.id,
    recipientCount: patients.length,
  };
}

const cancelSchema = z.object({ campaignId: z.string().min(1) });

export async function cancelCampaignAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization." };

  const parsed = cancelSchema.safeParse({
    campaignId: formData.get("campaignId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const campaign = await prisma.outreachCampaign.findFirst({
    where: {
      id: parsed.data.campaignId,
      organizationId: user.organizationId,
      status: { in: ["draft", "scheduled"] },
    },
    select: { id: true },
  });
  if (!campaign) {
    return {
      ok: false,
      error: "Campaign not found or already in flight.",
    };
  }

  await prisma.outreachCampaign.update({
    where: { id: campaign.id },
    data: { status: "cancelled" },
  });

  revalidatePath("/clinic/communications/broadcasts");
  return { ok: true };
}

// Airplane icon — immediate send of a scheduled/draft campaign. Reuses
// the same dev-mode "mark every recipient sent" flow as create-with-sendNow.
export async function sendCampaignNowAction(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization." };

  const parsed = cancelSchema.safeParse({
    campaignId: formData.get("campaignId"),
  });
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  const campaign = await prisma.outreachCampaign.findFirst({
    where: {
      id: parsed.data.campaignId,
      organizationId: user.organizationId,
      status: { in: ["draft", "scheduled"] },
    },
    select: { id: true },
  });
  if (!campaign) {
    return { ok: false, error: "Campaign not found or already sent." };
  }

  const now = new Date();
  await prisma.$transaction([
    prisma.outreachRecipient.updateMany({
      where: { campaignId: campaign.id },
      data: { status: "sent", sentAt: now },
    }),
    prisma.outreachCampaign.update({
      where: { id: campaign.id },
      data: { status: "completed", startedAt: now, completedAt: now },
    }),
  ]);

  revalidatePath("/clinic/communications/broadcasts");
  return { ok: true };
}
