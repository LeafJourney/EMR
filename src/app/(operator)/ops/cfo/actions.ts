"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { dispatch } from "@/lib/orchestration/dispatch";
import { cfoAgent } from "@/lib/agents/cfo-agent";
import { createLightContext } from "@/lib/orchestration/context";
import type {
  ExpenseCategory,
  BankAccountType,
  CashFlowDirection,
  CashFlowActivity,
  FixedAssetCategory,
  LiabilityType,
  EquityEntryType,
  FinancialGoalKind,
  FinancialReportPeriod,
} from "@prisma/client";

// ---------------------------------------------------------------------------
// CFO server actions — every write the operator can make to the books.
// All paths invalidate /ops/cfo so the dashboard re-renders fresh.
// ---------------------------------------------------------------------------

export type ActionResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/ops/cfo");
  revalidatePath("/ops/cfo/pnl");
  revalidatePath("/ops/cfo/cash-flow");
  revalidatePath("/ops/cfo/balance-sheet");
  revalidatePath("/ops/cfo/expenses");
  revalidatePath("/ops/cfo/cash");
  revalidatePath("/ops/cfo/liabilities");
  revalidatePath("/ops/cfo/assets");
  revalidatePath("/ops/cfo/equity");
  revalidatePath("/ops/cfo/goals");
  revalidatePath("/ops/cfo/reports");
}

// ── Run the CFO agent on demand ───────────────────────────────────

const generateSchema = z.object({
  period: z.enum(["weekly", "monthly", "quarterly", "annual", "daily"]).optional(),
});

export async function generateCfoReportAction(formData: FormData): Promise<ActionResult<{ reportId: string }>> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };

  const parsed = generateSchema.safeParse({ period: formData.get("period") || undefined });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  const ctx = createLightContext({ organizationId: user.organizationId });
  try {
    const result = await cfoAgent.run(
      { organizationId: user.organizationId, period: parsed.data.period ?? "weekly" },
      ctx,
    );
    revalidateAll();
    return { ok: true, data: { reportId: result.reportIds.briefing } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to generate report." };
  }
}

// ── Expenses ──────────────────────────────────────────────────────

const expenseSchema = z.object({
  category: z.string(),
  vendor: z.string().min(1),
  description: z.string().min(1),
  amountCents: z.number().int().positive(),
  taxCents: z.number().int().nonnegative().optional(),
  occurredOn: z.string(), // ISO
  paidAt: z.string().optional(), // ISO
  paymentMethod: z.string().optional(),
  bankAccountId: z.string().optional(),
  notes: z.string().optional(),
});

// A client-supplied bankAccountId must belong to the caller's org before it
// can drive a balance mutation — otherwise an operator could move money in
// another organization's account by passing its raw id (EMR-805).
async function bankAccountBelongsToOrg(
  bankAccountId: string,
  organizationId: string,
): Promise<boolean> {
  const acct = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, organizationId },
    select: { id: true },
  });
  return acct !== null;
}

export async function createExpenseAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };

  const raw = {
    category: String(formData.get("category") || ""),
    vendor: String(formData.get("vendor") || ""),
    description: String(formData.get("description") || ""),
    amountCents: Math.round(Number(formData.get("amount") || 0) * 100),
    taxCents: Math.round(Number(formData.get("tax") || 0) * 100),
    occurredOn: String(formData.get("occurredOn") || new Date().toISOString().slice(0, 10)),
    paidAt: (formData.get("paidAt") ? String(formData.get("paidAt")) : undefined) || undefined,
    paymentMethod: (formData.get("paymentMethod") ? String(formData.get("paymentMethod")) : undefined) || undefined,
    bankAccountId: (formData.get("bankAccountId") ? String(formData.get("bankAccountId")) : undefined) || undefined,
    notes: (formData.get("notes") ? String(formData.get("notes")) : undefined) || undefined,
  };

  const parsed = expenseSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid expense." };

  if (
    parsed.data.bankAccountId &&
    !(await bankAccountBelongsToOrg(parsed.data.bankAccountId, user.organizationId))
  ) {
    return { ok: false, error: "Bank account not found." };
  }

  const totalCents = parsed.data.amountCents + (parsed.data.taxCents ?? 0);
  const created = await prisma.expense.create({
    data: {
      organizationId: user.organizationId,
      category: parsed.data.category as ExpenseCategory,
      vendor: parsed.data.vendor,
      description: parsed.data.description,
      amountCents: parsed.data.amountCents,
      taxCents: parsed.data.taxCents ?? 0,
      totalCents,
      occurredOn: new Date(parsed.data.occurredOn),
      paidAt: parsed.data.paidAt ? new Date(parsed.data.paidAt) : null,
      paymentMethod: parsed.data.paymentMethod ?? null,
      bankAccountId: parsed.data.bankAccountId ?? null,
      notes: parsed.data.notes ?? null,
      createdByUserId: user.id,
      status: "approved",
    },
  });

  // If paid, deduct from bank account and log a cash flow entry.
  if (created.paidAt && created.bankAccountId) {
    await prisma.$transaction([
      prisma.bankAccount.update({
        where: { id: created.bankAccountId },
        data: { currentBalanceCents: { decrement: created.totalCents } },
      }),
      prisma.cashFlowEntry.create({
        data: {
          organizationId: user.organizationId,
          bankAccountId: created.bankAccountId,
          direction: "out",
          activity: "operating",
          amountCents: created.totalCents,
          description: `${created.vendor} — ${created.description}`,
          occurredOn: created.paidAt,
          expenseId: created.id,
        },
      }),
    ]);
  }

  await dispatch({ name: "cfo.expense.recorded", expenseId: created.id, organizationId: user.organizationId });
  revalidateAll();
  return { ok: true };
}

export async function deleteExpenseAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false, error: "Missing id." };
  const existing = await prisma.expense.findUnique({ where: { id }, select: { organizationId: true, totalCents: true, paidAt: true, bankAccountId: true } });
  if (!existing || existing.organizationId !== user.organizationId) return { ok: false, error: "Not found." };

  await prisma.$transaction(async (tx) => {
    await tx.expense.delete({ where: { id } });
    if (existing.paidAt && existing.bankAccountId) {
      await tx.bankAccount.update({
        where: { id: existing.bankAccountId },
        data: { currentBalanceCents: { increment: existing.totalCents } },
      });
    }
  });
  revalidateAll();
  return { ok: true };
}

// ── Bank accounts ────────────────────────────────────────────────

export async function createBankAccountAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "") as BankAccountType;
  const institution = String(formData.get("institution") || "").trim() || null;
  const last4 = String(formData.get("last4") || "").trim() || null;
  const opening = Math.round(Number(formData.get("opening") || 0) * 100);
  if (!name || !type) return { ok: false, error: "Name and type are required." };

  await prisma.bankAccount.create({
    data: {
      organizationId: user.organizationId,
      name,
      type,
      institution,
      last4,
      openingBalanceCents: opening,
      currentBalanceCents: opening,
      asOfDate: new Date(),
    },
  });
  revalidateAll();
  return { ok: true };
}

export async function updateBankBalanceAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };
  const id = String(formData.get("id") || "");
  const newBalance = Math.round(Number(formData.get("balance") || 0) * 100);
  const account = await prisma.bankAccount.findUnique({ where: { id }, select: { organizationId: true, currentBalanceCents: true } });
  if (!account || account.organizationId !== user.organizationId) return { ok: false, error: "Not found." };

  const delta = newBalance - account.currentBalanceCents;
  await prisma.$transaction([
    prisma.bankAccount.update({
      where: { id },
      data: { currentBalanceCents: newBalance, asOfDate: new Date() },
    }),
    prisma.cashFlowEntry.create({
      data: {
        organizationId: user.organizationId,
        bankAccountId: id,
        direction: delta >= 0 ? "in" : "out",
        activity: "operating",
        amountCents: Math.abs(delta),
        description: "Manual balance reconciliation",
        occurredOn: new Date(),
        metadata: { kind: "balance_reconciliation" },
      },
    }),
  ]);
  revalidateAll();
  return { ok: true };
}

// ── Cash flow entries ────────────────────────────────────────────

export async function recordCashEntryAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };
  const direction = String(formData.get("direction") || "") as CashFlowDirection;
  const activity = String(formData.get("activity") || "") as CashFlowActivity;
  const amountCents = Math.round(Number(formData.get("amount") || 0) * 100);
  const description = String(formData.get("description") || "").trim();
  const bankAccountId = String(formData.get("bankAccountId") || "") || null;
  const occurredOn = String(formData.get("occurredOn") || new Date().toISOString().slice(0, 10));

  if (!direction || !activity || !amountCents || !description) return { ok: false, error: "Missing required fields." };

  if (
    bankAccountId &&
    !(await bankAccountBelongsToOrg(bankAccountId, user.organizationId))
  ) {
    return { ok: false, error: "Bank account not found." };
  }

  await prisma.$transaction(async (tx) => {
    await tx.cashFlowEntry.create({
      data: {
        organizationId: user.organizationId!,
        direction,
        activity,
        amountCents,
        description,
        occurredOn: new Date(occurredOn),
        bankAccountId,
      },
    });
    if (bankAccountId) {
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: {
          currentBalanceCents:
            direction === "in"
              ? { increment: amountCents }
              : { decrement: amountCents },
        },
      });
    }
  });

  await dispatch({
    name: "cfo.cash.recorded",
    cashFlowEntryId: "n/a",
    organizationId: user.organizationId,
  });
  revalidateAll();
  return { ok: true };
}

// ── Fixed assets ────────────────────────────────────────────────

export async function createFixedAssetAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };
  const name = String(formData.get("name") || "").trim();
  const category = String(formData.get("category") || "") as FixedAssetCategory;
  const purchaseDate = String(formData.get("purchaseDate") || new Date().toISOString().slice(0, 10));
  const cost = Math.round(Number(formData.get("cost") || 0) * 100);
  const salvage = Math.round(Number(formData.get("salvage") || 0) * 100);
  const usefulLifeMonths = Number(formData.get("usefulLifeMonths") || 60);
  if (!name || !category || cost <= 0) return { ok: false, error: "Name, category, and cost required." };

  await prisma.fixedAsset.create({
    data: {
      organizationId: user.organizationId,
      name,
      category,
      purchaseDate: new Date(purchaseDate),
      acquiredCostCents: cost,
      salvageValueCents: salvage,
      usefulLifeMonths,
    },
  });
  revalidateAll();
  return { ok: true };
}

// ── Liabilities ─────────────────────────────────────────────────

export async function createLiabilityAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || "") as LiabilityType;
  const principal = Math.round(Number(formData.get("principal") || 0) * 100);
  const balance = Math.round(Number(formData.get("balance") || formData.get("principal") || 0) * 100);
  const rate = Number(formData.get("rate") || 0);
  const term = Number(formData.get("term") || 0) || null;
  const monthly = Math.round(Number(formData.get("monthly") || 0) * 100) || null;
  const startDate = String(formData.get("startDate") || new Date().toISOString().slice(0, 10));
  if (!name || !type || principal <= 0) return { ok: false, error: "Name, type, and principal required." };

  await prisma.liability.create({
    data: {
      organizationId: user.organizationId,
      name,
      type,
      principalCents: principal,
      balanceCents: balance,
      interestRate: rate || null,
      termMonths: term,
      monthlyPaymentCents: monthly,
      startDate: new Date(startDate),
    },
  });
  revalidateAll();
  return { ok: true };
}

// ── Equity entries ──────────────────────────────────────────────

export async function recordEquityEntryAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };
  const type = String(formData.get("type") || "") as EquityEntryType;
  const amountCents = Math.round(Number(formData.get("amount") || 0) * 100);
  const occurredOn = String(formData.get("occurredOn") || new Date().toISOString().slice(0, 10));
  const ownerName = String(formData.get("ownerName") || "").trim() || null;
  const description = String(formData.get("description") || "").trim();
  const bankAccountId = String(formData.get("bankAccountId") || "") || null;
  if (!type || amountCents <= 0 || !description) return { ok: false, error: "Type, amount, and description required." };

  // Outbound vs inbound to equity from the company's perspective:
  // contribution = + (cash in), distribution = - (cash out)
  const isInflow = type === "capital_contribution" || type === "stock_issuance";
  const signed = isInflow ? amountCents : -amountCents;

  await prisma.$transaction(async (tx) => {
    await tx.equityEntry.create({
      data: {
        organizationId: user.organizationId!,
        type,
        amountCents: signed,
        occurredOn: new Date(occurredOn),
        ownerName,
        description,
      },
    });
    if (bankAccountId) {
      await tx.bankAccount.update({
        where: { id: bankAccountId },
        data: {
          currentBalanceCents:
            isInflow ? { increment: amountCents } : { decrement: amountCents },
        },
      });
      await tx.cashFlowEntry.create({
        data: {
          organizationId: user.organizationId!,
          bankAccountId,
          direction: isInflow ? "in" : "out",
          activity: "financing",
          amountCents,
          description,
          occurredOn: new Date(occurredOn),
        },
      });
    }
  });
  revalidateAll();
  return { ok: true };
}

// ── Financial goals ─────────────────────────────────────────────

export async function upsertGoalAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };
  const id = String(formData.get("id") || "");
  const kind = String(formData.get("kind") || "") as FinancialGoalKind;
  const label = String(formData.get("label") || "").trim();
  const period = (String(formData.get("period") || "monthly") as FinancialReportPeriod) || "monthly";
  const targetCents = formData.get("targetAmount") ? Math.round(Number(formData.get("targetAmount")) * 100) : null;
  const targetPct = formData.get("targetPct") ? Number(formData.get("targetPct")) : null;
  const targetDays = formData.get("targetDays") ? Number(formData.get("targetDays")) : null;
  const notes = String(formData.get("notes") || "").trim() || null;
  if (!kind || !label) return { ok: false, error: "Kind and label required." };

  if (id) {
    const existing = await prisma.financialGoal.findUnique({ where: { id }, select: { organizationId: true } });
    if (!existing || existing.organizationId !== user.organizationId) return { ok: false, error: "Not found." };
    await prisma.financialGoal.update({
      where: { id },
      data: { kind, label, period, targetCents, targetPct, targetDays, notes },
    });
  } else {
    await prisma.financialGoal.create({
      data: {
        organizationId: user.organizationId,
        kind,
        label,
        period,
        targetCents,
        targetPct,
        targetDays,
        notes,
      },
    });
  }
  revalidateAll();
  return { ok: true };
}

export async function deactivateGoalAction(formData: FormData): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "Organization required." };
  const id = String(formData.get("id") || "");
  const goal = await prisma.financialGoal.findUnique({ where: { id }, select: { organizationId: true } });
  if (!goal || goal.organizationId !== user.organizationId) return { ok: false, error: "Not found." };
  await prisma.financialGoal.update({ where: { id }, data: { active: false } });
  revalidateAll();
  return { ok: true };
}
