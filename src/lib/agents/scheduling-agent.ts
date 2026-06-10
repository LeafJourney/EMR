import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";

// ---------------------------------------------------------------------------
// Scheduling Agent v2 — condition-aware cadence engine
// ---------------------------------------------------------------------------
// Replaces the stub "offer a 2-week follow-up" behavior with a rule-based
// cadence engine. Every patient touch resolves to one PRIMARY cadence
// (first-match wins against ordered rules) plus always-on SECONDARY
// reminders (refill audit + outcome check-in) that run in parallel.
//
// Each rule is explicit, testable, and its id + rationale travel with the
// Task so a physician or operator can see WHY a reminder was created. No
// hardcoded 14-day magic numbers.
//
// Input is event-shaped so this agent can be called from multiple entry
// points (encounter.finalized, regimen.created, regimen.changed,
// outcome.worsening, manual). Pure resolveCadenceRule() is exported for
// unit testing so the rule matrix can be verified without a DB.
// ---------------------------------------------------------------------------

export type CadenceTrigger =
  | "encounter.finalized"
  | "regimen.created"
  | "regimen.changed"
  | "outcome.worsening"
  | "manual";

const input = z.object({
  patientId: z.string(),
  trigger: z
    .enum([
      "encounter.finalized",
      "regimen.created",
      "regimen.changed",
      "outcome.worsening",
      "manual",
    ])
    .optional(),
  encounterId: z.string().optional(),
});

const actionSchema = z.object({
  ruleId: z.string(),
  type: z.string(),
  scheduledFor: z.string(),
  rationale: z.string(),
  taskId: z.string().nullable(),
  role: z.enum(["primary", "reminder"]),
});

const output = z.object({
  patientId: z.string(),
  primaryRuleId: z.string(),
  actions: z.array(actionSchema),
});

// ---------------------------------------------------------------------------
// Pure rule resolution — exported for tests
// ---------------------------------------------------------------------------

export interface CadenceSignals {
  /** Latest PHQ-9 total score (or null if none) */
  latestPhq9Score: number | null;
  /** Latest GAD-7 total score (or null if none) */
  latestGad7Score: number | null;
  /** true if a CUDIT-R assessment scored positive OR if presenting concerns
   * include CUD-style flags (loss of control, withdrawal). */
  cudScreenPositive: boolean;
  /** true if an active regimen was created in the last 14 days */
  hasNewRegimen: boolean;
  /** true if the patient has at least one active regimen */
  hasActiveRegimen: boolean;
  /** Days since the oldest active regimen's start date (null if none) */
  oldestActiveRegimenAgeDays: number | null;
  /** Most recent pain reading in the last 30 days, or null */
  latestPain: number | null;
  /** The trigger that invoked this run */
  trigger: CadenceTrigger;
}

export interface CadenceRuleResult {
  ruleId: string;
  daysUntil: number;
  title: string;
  rationale: string;
  type: string;
}

/**
 * Primary rule table. Evaluated top-to-bottom, first match wins. This is the
 * single source of truth for what a follow-up visit should look like.
 */
export const PRIMARY_CADENCE_RULES: Array<{
  id: string;
  match: (s: CadenceSignals) => boolean;
  apply: (s: CadenceSignals) => CadenceRuleResult;
}> = [
  {
    id: "urgent.worsening-mental-health",
    match: (s) =>
      (s.latestPhq9Score !== null && s.latestPhq9Score >= 15) ||
      (s.latestGad7Score !== null && s.latestGad7Score >= 15) ||
      s.trigger === "outcome.worsening",
    apply: (s) => ({
      ruleId: "urgent.worsening-mental-health",
      daysUntil: 7,
      title: "1-week urgent follow-up (mental-health severity)",
      type: "followup.urgent",
      rationale: `Severe depression/anxiety screening (PHQ-9=${s.latestPhq9Score ?? "n/a"}, GAD-7=${s.latestGad7Score ?? "n/a"}). Close the gap fast; do not wait the standard 90-day cycle.`,
    }),
  },
  {
    id: "urgent.cud-screen-positive",
    match: (s) => s.cudScreenPositive,
    apply: () => ({
      ruleId: "urgent.cud-screen-positive",
      daysUntil: 14,
      title: "2-week CUD check-in",
      type: "followup.cud",
      rationale:
        "CUDIT-R positive or presenting concerns flag cannabis use disorder. 2-week touch to reassess severity and offer treatment plan (screening, counseling, referral).",
    }),
  },
  {
    id: "titration.new-regimen",
    match: (s) => s.hasNewRegimen,
    apply: () => ({
      ruleId: "titration.new-regimen",
      daysUntil: 14,
      title: "2-week titration visit",
      type: "followup.titration",
      rationale:
        "New regimen started in the last 14 days — schedule a 2-week titration touch to tune dose, review tolerance, and capture early outcome data.",
    }),
  },
  {
    id: "pain.uncontrolled",
    match: (s) => s.latestPain !== null && s.latestPain >= 7,
    apply: (s) => ({
      ruleId: "pain.uncontrolled",
      daysUntil: 14,
      title: "2-week pain reassessment",
      type: "followup.pain",
      rationale: `Recent pain ${s.latestPain}/10. Uncontrolled pain demands a shorter cycle than the standard 90-day cadence — reassess and adjust.`,
    }),
  },
  {
    id: "standard.active-regimen",
    match: (s) =>
      s.hasActiveRegimen &&
      s.oldestActiveRegimenAgeDays !== null &&
      s.oldestActiveRegimenAgeDays >= 14,
    apply: () => ({
      ruleId: "standard.active-regimen",
      daysUntil: 90,
      title: "90-day established follow-up",
      type: "followup.standard",
      rationale:
        "Established patient on a stable active regimen (≥14 days). Standard 90-day cannabis follow-up cadence.",
    }),
  },
  {
    id: "standard.no-regimen",
    match: (s) => !s.hasActiveRegimen,
    apply: () => ({
      ruleId: "standard.no-regimen",
      daysUntil: 14,
      title: "2-week initial follow-up",
      type: "followup.initial",
      rationale:
        "No active regimen on file. Short cadence to revisit decision and start a plan if appropriate.",
    }),
  },
  {
    id: "fallback.reengagement",
    match: () => true,
    apply: () => ({
      ruleId: "fallback.reengagement",
      daysUntil: 30,
      title: "30-day re-engagement check",
      type: "followup.reengagement",
      rationale:
        "Safety-net cadence — no other rule matched. Default 30-day re-engagement so the patient is never fully off-radar.",
    }),
  },
];

/** Secondary rules — always emitted in addition to the primary. */
export const SECONDARY_CADENCE_RULES: CadenceRuleResult[] = [
  {
    ruleId: "reminder.refill-audit",
    daysUntil: 30,
    title: "Refill audit — reconcile regimen vs. doses logged",
    type: "reminder.refill",
    rationale:
      "Monthly refill audit: reconcile regimen against actual doses logged, flag adherence issues, and ensure supply for next 30 days.",
  },
  {
    ruleId: "reminder.outcome-checkin",
    daysUntil: 7,
    title: "7-day outcome check-in nudge",
    type: "reminder.outcome",
    rationale:
      "Weekly nudge to capture a pain/sleep/anxiety/mood check-in. Keeps outcome data dense enough for research export + cohort comparisons.",
  },
];

export function resolveCadenceRule(signals: CadenceSignals): CadenceRuleResult {
  for (const rule of PRIMARY_CADENCE_RULES) {
    if (rule.match(signals)) return rule.apply(signals);
  }
  // PRIMARY_CADENCE_RULES always ends with `fallback.reengagement` whose
  // match returns true, so this branch is unreachable. Defensive default
  // keeps the type checker happy.
  return {
    ruleId: "fallback.reengagement",
    daysUntil: 30,
    title: "30-day re-engagement check",
    type: "followup.reengagement",
    rationale: "Defensive fallback — primary rule table returned no match.",
  };
}

// ---------------------------------------------------------------------------
// Signal loaders — pure DB reads; kept side-effect-free so the agent is
// obvious to debug.
// ---------------------------------------------------------------------------

async function loadSignals(
  patientId: string,
  trigger: CadenceTrigger,
): Promise<CadenceSignals> {
  const now = Date.now();

  const [regimens, recentAssessments, recentPainLogs, patient] = await Promise.all([
    prisma.dosingRegimen.findMany({
      where: { patientId, active: true },
      orderBy: { startDate: "asc" },
      select: { startDate: true, createdAt: true },
    }),
    prisma.assessmentResponse.findMany({
      where: { patientId },
      orderBy: { submittedAt: "desc" },
      take: 10,
      include: { assessment: { select: { slug: true } } },
    }),
    prisma.outcomeLog.findMany({
      where: {
        patientId,
        metric: "pain",
        loggedAt: { gte: new Date(now - 30 * 86_400_000) },
      },
      orderBy: { loggedAt: "desc" },
      take: 3,
    }),
    prisma.patient.findUnique({
      where: { id: patientId },
      select: { presentingConcerns: true },
    }),
  ]);

  const hasActiveRegimen = regimens.length > 0;
  const oldestActiveRegimenAgeDays = hasActiveRegimen
    ? Math.floor((now - regimens[0].startDate.getTime()) / 86_400_000)
    : null;
  const hasNewRegimen = regimens.some(
    (r) => now - r.createdAt.getTime() < 14 * 86_400_000,
  );

  const latestBySlug = new Map<string, number | null>();
  for (const a of recentAssessments) {
    const slug = a.assessment.slug;
    if (latestBySlug.has(slug)) continue;
    const score = a.score ?? (typeof (a.answers as any)?.totalScore === "number"
      ? ((a.answers as any).totalScore as number)
      : null);
    latestBySlug.set(slug, score);
  }
  const latestPhq9Score = latestBySlug.get("phq-9") ?? null;
  const latestGad7Score = latestBySlug.get("gad-7") ?? null;
  const latestCuditr = latestBySlug.get("cudit-r") ?? null;

  const concernsText = (patient?.presentingConcerns ?? "").toLowerCase();
  const cudScreenPositive =
    (latestCuditr !== null && latestCuditr >= 8) ||
    concernsText.includes("cannabis use disorder") ||
    concernsText.includes("cud") ||
    concernsText.includes("withdrawal") ||
    concernsText.includes("loss of control");

  const latestPain = recentPainLogs[0]?.value ?? null;

  return {
    latestPhq9Score,
    latestGad7Score,
    cudScreenPositive,
    hasNewRegimen,
    hasActiveRegimen,
    oldestActiveRegimenAgeDays,
    latestPain,
    trigger,
  };
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const schedulingAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: "scheduling",
  version: "2.0.0",
  description:
    "Condition-aware scheduling cadence engine. Resolves one primary follow-up " +
    "rule (mental-health severity, CUD, titration, pain, standard, or re-engagement) " +
    "and layers always-on refill + outcome reminders. Every task carries its rule id " +
    "and rationale so operators see WHY it was created.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "write.task"],
  requiresApproval: false,

  async run({ patientId, trigger, encounterId }, ctx) {
    ctx.assertCan("read.patient");
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    const resolvedTrigger: CadenceTrigger = trigger ?? "manual";
    const signals = await loadSignals(patientId, resolvedTrigger);
    const primary = resolveCadenceRule(signals);

    ctx.log("info", "Cadence engine resolved", {
      primaryRuleId: primary.ruleId,
      trigger: resolvedTrigger,
      signals: {
        hasActiveRegimen: signals.hasActiveRegimen,
        hasNewRegimen: signals.hasNewRegimen,
        latestPhq9: signals.latestPhq9Score,
        latestGad7: signals.latestGad7Score,
        latestPain: signals.latestPain,
        cudScreenPositive: signals.cudScreenPositive,
      },
    });

    const toCreate: Array<{
      rule: CadenceRuleResult;
      role: "primary" | "reminder";
    }> = [
      { rule: primary, role: "primary" },
      ...SECONDARY_CADENCE_RULES.map((r) => ({ rule: r, role: "reminder" as const })),
    ];

    ctx.assertCan("write.task");
    const now = Date.now();

    const created = [] as z.infer<typeof actionSchema>[];
    for (const { rule, role } of toCreate) {
      const dueAt = new Date(now + rule.daysUntil * 86_400_000);
      const description = `[${rule.ruleId}] ${rule.rationale}${encounterId ? `\n\nSource encounter: ${encounterId}` : ""}${resolvedTrigger !== "manual" ? `\nTrigger: ${resolvedTrigger}` : ""}`;
      const task = await prisma.task.create({
        data: {
          organizationId: patient.organizationId,
          patientId,
          title: rule.title,
          description,
          kind: "recall",
          assigneeRole: "operator",
          dueAt,
        },
      });
      created.push({
        ruleId: rule.ruleId,
        type: rule.type,
        scheduledFor: dueAt.toISOString(),
        rationale: rule.rationale,
        taskId: task.id,
        role,
      });
    }

    await writeAgentAudit(
      "scheduling",
      "2.0.0",
      patient.organizationId,
      "scheduling.cadence.resolved",
      { type: "Patient", id: patientId },
      {
        trigger: resolvedTrigger,
        primaryRuleId: primary.ruleId,
        taskCount: created.length,
        encounterId: encounterId ?? null,
      },
    );

    return {
      patientId,
      primaryRuleId: primary.ruleId,
      actions: created,
    };
  },
};
