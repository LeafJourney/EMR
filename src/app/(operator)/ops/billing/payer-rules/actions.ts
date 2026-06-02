"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import {
  fromPrismaPayerRule,
  savePayerRule,
} from "@/lib/billing/payer-rules-db";
import { prisma } from "@/lib/db/prisma";

// EMR-218 — server actions for the payer-rules admin editor.
// Every save writes a PayerRuleAuditLog row tied to the current user, and
// triggers a /ops/billing/payer-rules revalidation so the table refreshes.

const payerRuleFormSchema = z.object({
  id: z.string().min(1).max(64),
  displayName: z.string().min(1).max(120),
  aliases: z.string().max(2000).default(""),
  class: z.enum([
    "commercial",
    "government",
    "medicare_advantage",
    "medicaid_managed",
    "workers_comp",
    "self_pay",
    "other",
  ]),
  timelyFilingDays: z.coerce.number().int().min(1).max(3650),
  correctedTimelyFilingDays: z.coerce.number().int().min(1).max(3650),
  appealLevel1Days: z.coerce.number().int().min(1).max(3650),
  appealLevel2Days: z.coerce.number().int().min(1).max(3650),
  appealExternalReviewDays: z.union([z.coerce.number().int().min(1).max(3650), z.literal("").transform(() => null)]).nullable().optional(),
  ackSlaDays: z.coerce.number().int().min(0).max(60),
  adjudicationSlaDays: z.coerce.number().int().min(1).max(365),
  eligibilityTtlHours: z.coerce.number().int().min(1).max(168),
  correctedClaimFrequency: z.enum(["7", "6", "8_then_1"]),
  honorsMod25OnZ71: z.coerce.boolean(),
  requiresPriorAuthForCannabis: z.coerce.boolean(),
  excludesCannabis: z.coerce.boolean(),
  cannabisPolicyCitation: z.string().max(500).nullable().optional(),
  supportsElectronicSubmission: z.coerce.boolean(),
  attachmentChannels: z.string().max(200).default(""),
  // Required for the audit log — the editor labels this "Required for audit"
  // and the PayerRuleAuditLog row is only meaningful with a stated reason.
  reason: z.string().trim().min(1, "A reason for the change is required for the audit log").max(500),
});

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function savePayerRuleAction(formData: FormData): Promise<SaveResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization in session" };

  const raw = Object.fromEntries(formData.entries()) as Record<string, string>;
  const parsed = payerRuleFormSchema.safeParse({
    ...raw,
    honorsMod25OnZ71: raw.honorsMod25OnZ71 === "on",
    requiresPriorAuthForCannabis: raw.requiresPriorAuthForCannabis === "on",
    excludesCannabis: raw.excludesCannabis === "on",
    supportsElectronicSubmission: raw.supportsElectronicSubmission === "on",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") };
  }
  const v = parsed.data;

  const channels = v.attachmentChannels
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => ["pwk_electronic", "fax", "mail", "portal"].includes(s)) as Array<
    "pwk_electronic" | "fax" | "mail" | "portal"
  >;

  await savePayerRule({
    rule: {
      id: v.id,
      displayName: v.displayName,
      aliases: v.aliases.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
      class: v.class,
      timelyFilingDays: v.timelyFilingDays,
      correctedTimelyFilingDays: v.correctedTimelyFilingDays,
      appealDeadlines: {
        level1Days: v.appealLevel1Days,
        level2Days: v.appealLevel2Days,
        externalReviewDays: v.appealExternalReviewDays ?? null,
      },
      ackSlaDays: v.ackSlaDays,
      adjudicationSlaDays: v.adjudicationSlaDays,
      eligibilityTtlHours: v.eligibilityTtlHours,
      correctedClaimFrequency: v.correctedClaimFrequency,
      honorsMod25OnZ71: v.honorsMod25OnZ71,
      requiresPriorAuthForCannabis: v.requiresPriorAuthForCannabis,
      excludesCannabis: v.excludesCannabis,
      cannabisPolicyCitation: v.cannabisPolicyCitation || null,
      supportsElectronicSubmission: v.supportsElectronicSubmission,
      attachmentChannels: channels,
    },
    organizationId: user.organizationId,
    editedById: user.id,
    reason: v.reason,
  });

  revalidatePath("/ops/billing/payer-rules");
  revalidatePath(`/ops/billing/payer-rules/editor`);
  // Redirect when invoked from a `<form action={savePayerRuleAction}>`. The
  // typed return is preserved for any direct programmatic callers that
  // happen before this point.
  redirect("/ops/billing/payer-rules");
}

export async function loadPayerRulesForOrg(organizationId: string) {
  const [globals, orgs] = await Promise.all([
    prisma.payerRule.findMany({ where: { organizationId: null }, orderBy: { displayName: "asc" } }),
    prisma.payerRule.findMany({ where: { organizationId }, orderBy: { displayName: "asc" } }),
  ]);
  const merged = new Map<string, ReturnType<typeof fromPrismaPayerRule> & { lastReviewedAt: Date; isOrgOverride: boolean }>();
  for (const g of globals) {
    merged.set(g.id, { ...fromPrismaPayerRule(g), lastReviewedAt: g.lastReviewedAt, isOrgOverride: false });
  }
  for (const o of orgs) {
    merged.set(o.id, { ...fromPrismaPayerRule(o), lastReviewedAt: o.lastReviewedAt, isOrgOverride: true });
  }
  return [...merged.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
}
