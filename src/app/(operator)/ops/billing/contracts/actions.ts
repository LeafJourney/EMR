"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { parseContractCsv } from "@/lib/billing/payer-contracts";

// EMR-223 — server actions for the per-payer contract allowables admin page.
// The pure underpayment detector (payer-contracts.ts) already exists; this is
// the operator surface that loads the negotiated `PayerContractRate` rows it
// compares against. Every mutation is org-scoped and audit-logged.

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const createSchema = z.object({
  payerId: z.string().trim().min(1, "payer ID is required").max(64),
  payerName: z.string().trim().min(1, "payer name is required").max(120),
  contractName: z.string().trim().min(1, "contract name is required").max(120),
  effectiveStart: z.string().trim().min(1, "effective start date is required"),
  effectiveEnd: z.string().trim().optional(),
  csv: z.string().min(1, "paste the contract rate CSV"),
});

function parseDate(value: string): Date | null {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Create a contract + its rate rows from an admin-pasted CSV. */
export async function createContractAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization in session" };

  const parsed = createSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const v = parsed.data;

  const effectiveStart = parseDate(v.effectiveStart);
  if (!effectiveStart) return { ok: false, error: `invalid effective start date "${v.effectiveStart}"` };
  const effectiveEnd = v.effectiveEnd ? parseDate(v.effectiveEnd) : null;
  if (v.effectiveEnd && !effectiveEnd) return { ok: false, error: `invalid effective end date "${v.effectiveEnd}"` };
  if (effectiveEnd && effectiveEnd.getTime() < effectiveStart.getTime()) {
    return { ok: false, error: "effective end date is before the start date" };
  }

  const { rates, errors } = parseContractCsv(v.csv);
  if (rates.length === 0) {
    const detail = errors.length ? ` (${errors.length} bad rows)` : "";
    return { ok: false, error: `no valid rate rows parsed from the CSV${detail}` };
  }

  // Guard against a duplicate (payer, effective-start) contract — the schema
  // enforces it, but we surface a friendly message instead of a 500.
  const existing = await prisma.payerContract.findUnique({
    where: {
      organizationId_payerId_effectiveStart: {
        organizationId: user.organizationId,
        payerId: v.payerId,
        effectiveStart,
      },
    },
    select: { id: true },
  });
  if (existing) {
    return {
      ok: false,
      error: `a contract for ${v.payerId} effective ${v.effectiveStart} already exists — deactivate it before re-uploading`,
    };
  }

  const contract = await prisma.payerContract.create({
    data: {
      organizationId: user.organizationId,
      payerId: v.payerId,
      payerName: v.payerName,
      contractName: v.contractName,
      effectiveStart,
      effectiveEnd,
      active: true,
      sourceRef: `admin upload — ${rates.length} rates`,
      rates: {
        createMany: {
          data: rates.map((r) => ({
            cptCode: r.cptCode,
            modifier: r.modifier,
            allowedCents: r.allowedCents,
          })),
        },
      },
    },
    select: { id: true },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: "billing.contract.created",
      subjectType: "PayerContract",
      subjectId: contract.id,
      metadata: {
        payerId: v.payerId,
        rateCount: rates.length,
        parseErrors: errors.length,
        effectiveStart: v.effectiveStart,
      },
    },
  });

  revalidatePath("/ops/billing/contracts");
  const errNote = errors.length ? ` (${errors.length} rows skipped)` : "";
  return { ok: true, message: `Loaded ${rates.length} rates for ${v.payerName}${errNote}.` };
}

const toggleSchema = z.object({
  contractId: z.string().min(1),
  active: z.enum(["true", "false"]),
});

/** Activate / deactivate a contract. Deactivating removes it from
 *  `findEffectiveContract` so underpayment detection stops using it. */
export async function setContractActiveAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization in session" };

  const parsed = toggleSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { ok: false, error: "bad request" };
  const active = parsed.data.active === "true";

  // Org-scope the update so an operator can't toggle a sibling tenant's row.
  const contract = await prisma.payerContract.findFirst({
    where: { id: parsed.data.contractId, organizationId: user.organizationId },
    select: { id: true },
  });
  if (!contract) return { ok: false, error: "contract not found in this organization" };

  await prisma.payerContract.update({
    where: { id: contract.id },
    data: { active },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId,
      actorUserId: user.id,
      action: active ? "billing.contract.activated" : "billing.contract.deactivated",
      subjectType: "PayerContract",
      subjectId: contract.id,
    },
  });

  revalidatePath("/ops/billing/contracts");
  return { ok: true, message: active ? "Contract activated." : "Contract deactivated." };
}
