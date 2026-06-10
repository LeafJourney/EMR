"use server";

// EMR-037 — fax send action.
//
// In production this would queue a job for the fax provider (Phaxio,
// SRFax, etc.) and store the rendered PDF in object storage. In dev
// we just create the row in `queued` state so the UI can show the
// submission flow end-to-end.

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

// EMR-1111 (FO-M4) — sendFaxAction previously had no role gate; front desk
// access was accidental. Explicit allowlist: desk + clinical + ops roles.
const FAX_SEND_ROLES: ReadonlySet<Role> = new Set<Role>([
  "front_office",
  "back_office",
  "clinician",
  "midlevel",
  "practice_owner",
  "operator",
]);

const sendFaxSchema = z.object({
  toNumber: z
    .string()
    .min(7)
    .max(20)
    .regex(/^[\d+\-().\s]+$/, "Use digits, +, -, ()"),
  fromNumber: z
    .string()
    .min(7)
    .max(20)
    .regex(/^[\d+\-().\s]+$/, "Use digits, +, -, ()"),
  pageCount: z.coerce.number().int().min(1).max(500).optional(),
  patientId: z.string().optional().nullable(),
  notes: z.string().max(500).optional(),
});

export type SendFaxResult =
  | { ok: true; faxId: string }
  | { ok: false; error: string };

export async function sendFaxAction(
  _prev: SendFaxResult | null,
  formData: FormData,
): Promise<SendFaxResult> {
  const user = await requireUser();
  if (!user.organizationId) {
    return { ok: false, error: "No organization context." };
  }
  if (!user.roles.some((r) => FAX_SEND_ROLES.has(r))) {
    return { ok: false, error: "You don't have permission to send faxes." };
  }

  const parsed = sendFaxSchema.safeParse({
    toNumber: formData.get("toNumber"),
    fromNumber: formData.get("fromNumber"),
    pageCount: formData.get("pageCount") || undefined,
    patientId: (formData.get("patientId") as string) || null,
    notes: (formData.get("notes") as string) || undefined,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid fax payload.",
    };
  }

  if (parsed.data.patientId) {
    const patient = await prisma.patient.findFirst({
      where: {
        id: parsed.data.patientId,
        organizationId: user.organizationId,
      },
      select: { id: true },
    });
    if (!patient) return { ok: false, error: "Patient not in your org." };
  }

  const fax = await prisma.faxRecord.create({
    data: {
      organizationId: user.organizationId,
      direction: "outbound",
      status: "queued",
      fromNumber: parsed.data.fromNumber,
      toNumber: parsed.data.toNumber,
      pageCount: parsed.data.pageCount ?? null,
      patientId: parsed.data.patientId ?? null,
      initiatorUserId: user.id,
      errorMessage: parsed.data.notes ?? null,
    },
    select: { id: true },
  });

  revalidatePath("/clinic/communications");
  revalidatePath("/clinic/communications/fax");
  return { ok: true, faxId: fax.id };
}
