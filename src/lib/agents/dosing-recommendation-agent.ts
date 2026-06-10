import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";

// ---------------------------------------------------------------------------
// Dosing Recommendation Agent (EMR-52 / EMR-004)
// ---------------------------------------------------------------------------
// AI-powered cannabis dosing recommendations based on condition, weight,
// tolerance, prior response. Follows the "start low, go slow" principle.
// Evidence-backed from research corpus. Requires physician approval.
// ---------------------------------------------------------------------------

const input = z.object({
  patientId: z.string(),
  targetCondition: z.string().optional(),
});

const recommendationSchema = z.object({
  productType: z.string(),
  route: z.string(),
  startingDose: z.object({
    thcMg: z.number(),
    cbdMg: z.number(),
    frequency: z.string(),
    timing: z.string(),
  }),
  titrationSchedule: z.array(z.object({
    week: z.number(),
    thcMg: z.number(),
    cbdMg: z.number(),
    frequency: z.string(),
    note: z.string(),
  })),
  maxRecommendedDose: z.object({
    thcMgPerDay: z.number(),
    cbdMgPerDay: z.number(),
  }),
  rationale: z.string(),
  warnings: z.array(z.string()),
  patientInstructions: z.string(),
});

const output = z.object({
  patientName: z.string(),
  generatedAt: z.string(),
  experienceLevel: z.string(),
  recommendations: z.array(recommendationSchema),
  generalGuidance: z.string(),
  whenToContact: z.array(z.string()),
});

export type DosingRecommendation = z.infer<typeof output>;

// ---------------------------------------------------------------------------
// Evidence-based starting dose tables
// ---------------------------------------------------------------------------

interface DoseGuideline {
  route: string;
  productType: string;
  naive: { thcMg: number; cbdMg: number; frequency: string; timing: string };
  experienced: { thcMg: number; cbdMg: number; frequency: string; timing: string };
  maxThcPerDay: number;
  maxCbdPerDay: number;
  titrationNote: string;
}

const DOSE_GUIDELINES: Record<string, DoseGuideline> = {
  sublingual_oil: {
    route: "sublingual",
    productType: "oil / tincture",
    naive: { thcMg: 1, cbdMg: 5, frequency: "Once daily", timing: "In the evening, 1 hour before bed" },
    experienced: { thcMg: 2.5, cbdMg: 10, frequency: "Twice daily", timing: "Morning and evening" },
    maxThcPerDay: 30,
    maxCbdPerDay: 100,
    titrationNote: "Increase by 1mg THC every 3-5 days until desired effect or side effects appear",
  },
  oral_capsule: {
    route: "oral",
    productType: "capsule / edible",
    naive: { thcMg: 1, cbdMg: 5, frequency: "Once daily", timing: "With food, in the evening" },
    experienced: { thcMg: 2.5, cbdMg: 10, frequency: "Twice daily", timing: "With meals, morning and evening" },
    maxThcPerDay: 30,
    maxCbdPerDay: 100,
    titrationNote: "Wait at least 2 hours after ingestion before adjusting. Onset is slower than sublingual.",
  },
  inhalation: {
    route: "inhalation",
    productType: "vape / flower",
    naive: { thcMg: 1, cbdMg: 0, frequency: "As needed", timing: "Start with a single small inhalation" },
    experienced: { thcMg: 2.5, cbdMg: 0, frequency: "As needed, up to 3x daily", timing: "When symptoms arise" },
    maxThcPerDay: 20,
    maxCbdPerDay: 0,
    titrationNote: "Wait 10-15 minutes between inhalations. Effects are fast but shorter-lasting.",
  },
  topical: {
    route: "topical",
    productType: "cream / balm",
    naive: { thcMg: 5, cbdMg: 10, frequency: "2-3 times daily", timing: "Apply to affected area" },
    experienced: { thcMg: 10, cbdMg: 20, frequency: "3-4 times daily", timing: "Apply to affected area" },
    maxThcPerDay: 50,
    maxCbdPerDay: 100,
    titrationNote: "Topicals are local-acting and non-intoxicating. Adjust frequency based on relief.",
  },
};

// Condition → preferred route mapping
const CONDITION_ROUTES: Record<string, string[]> = {
  insomnia: ["sublingual_oil", "oral_capsule"],
  anxiety: ["sublingual_oil", "oral_capsule"],
  pain: ["sublingual_oil", "topical", "inhalation"],
  "chronic pain": ["sublingual_oil", "topical", "oral_capsule"],
  nausea: ["inhalation", "sublingual_oil"],
  migraine: ["inhalation", "sublingual_oil"],
  depression: ["sublingual_oil", "oral_capsule"],
  ptsd: ["sublingual_oil", "oral_capsule"],
  cancer: ["sublingual_oil", "oral_capsule", "inhalation"],
};

function resolveExperienceLevel(cannabis: any): "naive" | "experienced" {
  if (!cannabis) return "naive";
  if (cannabis.priorUse === true) return "experienced";
  return "naive";
}

function matchConditionRoutes(condition: string | null): string[] {
  if (!condition) return ["sublingual_oil"];
  const lower = condition.toLowerCase();
  for (const [key, routes] of Object.entries(CONDITION_ROUTES)) {
    if (lower.includes(key)) return routes;
  }
  return ["sublingual_oil"];
}

export const dosingRecommendationAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "dosingRecommendation",
  version: "1.0.0",
  description:
    "Generates evidence-based cannabis dosing recommendations based on " +
    "patient condition, history, tolerance, and prior response. Start low, go slow.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "read.encounter"],
  requiresApproval: true,

  async run({ patientId, targetCondition }, ctx) {
    ctx.log("info", "Generating dosing recommendation", { patientId });

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        dosingRegimens: {
          where: { active: true },
          include: { product: true },
        },
        outcomeLogs: {
          orderBy: { loggedAt: "desc" },
          take: 20,
        },
        medications: {
          where: { active: true },
        },
      },
    });

    if (!patient) throw new Error(`Patient ${patientId} not found`);

    const cannabis = patient.cannabisHistory as any;
    const level = resolveExperienceLevel(cannabis);
    const condition = targetCondition ?? patient.presentingConcerns ?? null;
    const preferredRoutes = matchConditionRoutes(condition);

    // Check for current regimens — if patient is already on a regimen,
    // the recommendation should be an adjustment, not a fresh start
    const hasActiveRegimen = patient.dosingRegimens.length > 0;

    // Build outcome trend context
    const outcomeContext = (() => {
      if (patient.outcomeLogs.length === 0) return "No outcome data available";
      const byMetric: Record<string, number[]> = {};
      for (const log of patient.outcomeLogs) {
        if (!byMetric[log.metric]) byMetric[log.metric] = [];
        byMetric[log.metric].push(log.value);
      }
      return Object.entries(byMetric)
        .map(([m, vals]) => `${m}: latest ${vals[0]}/10 (${vals.length} readings)`)
        .join("; ");
    })();

    // Current medications for interaction context
    const currentMeds = patient.medications
      .map((m: any) => m.name)
      .join(", ") || "None";

    const prompt = `You are a cannabis medicine dosing specialist at Leafjourney. Generate a personalized dosing recommendation.

PATIENT: ${patient.firstName} ${patient.lastName}
CONDITION: ${condition ?? "General wellness"}
EXPERIENCE: ${level === "naive" ? "Cannabis-naive (no prior use)" : "Has prior cannabis experience"}
CURRENT MEDICATIONS: ${currentMeds}
ALLERGIES: ${patient.allergies.join(", ") || "None"}
CONTRAINDICATIONS: ${patient.contraindications.join(", ") || "None"}
ACTIVE CANNABIS REGIMENS: ${hasActiveRegimen ? patient.dosingRegimens.map((r: any) => `${r.product?.name}: ${r.calculatedThcMgPerDose}mg THC + ${r.calculatedCbdMgPerDose}mg CBD, ${r.frequencyPerDay}x/day`).join("; ") : "None"}
OUTCOME TRENDS: ${outcomeContext}
PREFERRED ROUTES: ${preferredRoutes.join(", ")}

RULES:
- Follow "start low, go slow" — especially for naive patients
- Consider drug interactions with current medications
- Respect contraindications — if absolute, do NOT recommend that route
- ${hasActiveRegimen ? "Patient is already on a regimen. Recommend adjustments based on outcome trends." : "Patient is new. Start conservatively."}
- Provide a titration schedule over 4 weeks
- Write patient instructions at a 3rd-grade reading level
- Do NOT use "As an AI" — you are the care team's dosing specialist

Return ONLY valid JSON matching this structure:
{
  "patientName": "${patient.firstName}",
  "generatedAt": "${new Date().toISOString()}",
  "experienceLevel": "${level}",
  "recommendations": [
    {
      "productType": "oil / tincture",
      "route": "sublingual",
      "startingDose": { "thcMg": 1, "cbdMg": 5, "frequency": "Once daily", "timing": "In the evening" },
      "titrationSchedule": [
        { "week": 1, "thcMg": 1, "cbdMg": 5, "frequency": "Once daily", "note": "Starting dose — observe effects" },
        { "week": 2, "thcMg": 2, "cbdMg": 5, "frequency": "Once daily", "note": "Increase THC if tolerated" },
        { "week": 3, "thcMg": 2.5, "cbdMg": 10, "frequency": "Twice daily", "note": "Add morning dose if needed" },
        { "week": 4, "thcMg": 5, "cbdMg": 10, "frequency": "Twice daily", "note": "Target maintenance dose" }
      ],
      "maxRecommendedDose": { "thcMgPerDay": 30, "cbdMgPerDay": 100 },
      "rationale": "Why this route and dose for this patient",
      "warnings": ["Relevant warnings"],
      "patientInstructions": "Simple, warm instructions for the patient"
    }
  ],
  "generalGuidance": "2-3 sentences of personalized guidance",
  "whenToContact": ["When to reach out to the care team"]
}`;

    let raw = "";
    try {
      raw = await ctx.model.complete(prompt, {
        maxTokens: 2000,
        temperature: 0.3,
        redactNames: [patient.firstName, patient.lastName].filter(Boolean),
      });
    } catch (err) {
      ctx.log("warn", "LLM call failed — using deterministic fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const jsonMatch =
      raw.match(/```(?:json)?\s*([\s\S]*?)```/) || raw.match(/(\{[\s\S]*\})/);
    let parsed: any = null;
    if (jsonMatch) {
      try {
        parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } catch {
        parsed = null;
      }
    }

    if (parsed?.recommendations?.length) {
      return {
        patientName: patient.firstName,
        generatedAt: new Date().toISOString(),
        experienceLevel: level,
        recommendations: parsed.recommendations.map((r: any) => ({
          productType: String(r.productType ?? "oil / tincture"),
          route: String(r.route ?? "sublingual"),
          startingDose: {
            thcMg: Number(r.startingDose?.thcMg ?? 1),
            cbdMg: Number(r.startingDose?.cbdMg ?? 5),
            frequency: String(r.startingDose?.frequency ?? "Once daily"),
            timing: String(r.startingDose?.timing ?? "In the evening"),
          },
          titrationSchedule: Array.isArray(r.titrationSchedule)
            ? r.titrationSchedule.map((t: any) => ({
                week: Number(t.week ?? 1),
                thcMg: Number(t.thcMg ?? 1),
                cbdMg: Number(t.cbdMg ?? 5),
                frequency: String(t.frequency ?? "Once daily"),
                note: String(t.note ?? ""),
              }))
            : [],
          maxRecommendedDose: {
            thcMgPerDay: Number(r.maxRecommendedDose?.thcMgPerDay ?? 30),
            cbdMgPerDay: Number(r.maxRecommendedDose?.cbdMgPerDay ?? 100),
          },
          rationale: String(r.rationale ?? ""),
          warnings: Array.isArray(r.warnings) ? r.warnings.map(String) : [],
          patientInstructions: String(r.patientInstructions ?? ""),
        })),
        generalGuidance: String(parsed.generalGuidance ?? ""),
        whenToContact: Array.isArray(parsed.whenToContact) ? parsed.whenToContact.map(String) : [],
      };
    }

    // Deterministic fallback — use evidence-based dose tables
    const recommendations = preferredRoutes.slice(0, 2).map((routeKey) => {
      const guide = DOSE_GUIDELINES[routeKey] ?? DOSE_GUIDELINES.sublingual_oil!;
      const dose = guide[level];
      return {
        productType: guide.productType,
        route: guide.route,
        startingDose: dose,
        titrationSchedule: [
          { week: 1, ...dose, note: "Starting dose — see how your body responds" },
          { week: 2, thcMg: dose.thcMg * 1.5, cbdMg: dose.cbdMg, frequency: dose.frequency, note: "Small increase if week 1 was tolerated well" },
          { week: 3, thcMg: dose.thcMg * 2, cbdMg: dose.cbdMg * 1.5, frequency: dose.frequency, note: "Continue adjusting toward your target" },
          { week: 4, thcMg: dose.thcMg * 2.5, cbdMg: dose.cbdMg * 2, frequency: dose.frequency, note: "Settling into your maintenance dose" },
        ],
        maxRecommendedDose: {
          thcMgPerDay: guide.maxThcPerDay,
          cbdMgPerDay: guide.maxCbdPerDay,
        },
        rationale: `${guide.productType} via ${guide.route} is commonly recommended for ${condition ?? "general wellness"}. ${guide.titrationNote}`,
        warnings: patient.contraindications.length > 0
          ? [`Note: you have flagged contraindications (${patient.contraindications.join(", ")}). Your prescriber has reviewed these.`]
          : [],
        patientInstructions: `${patient.firstName}, start with ${dose.thcMg}mg THC and ${dose.cbdMg}mg CBD, taken ${dose.frequency.toLowerCase()}, ${dose.timing.toLowerCase()}. This is your starting point — we'll adjust together over the next few weeks.`,
      };
    });

    return {
      patientName: patient.firstName,
      generatedAt: new Date().toISOString(),
      experienceLevel: level,
      recommendations,
      generalGuidance: `${patient.firstName}, cannabis dosing is personal — what works for someone else may not be right for you. We start with a low dose and increase slowly. Track how you feel each day using the Outcomes tab so we can make smart adjustments together.`,
      whenToContact: [
        "You feel too intoxicated or the effects are overwhelming",
        "You notice new or worsening symptoms",
        "You're unsure about when or how to take your dose",
        "You want to change anything about your regimen",
      ],
    };
  },
};
