import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";

// ---------------------------------------------------------------------------
// Titration Agent
// ---------------------------------------------------------------------------
// Loads a patient's active dosing regimen + product + last 30 days of
// outcome logs, then asks the model client whether the current regimen
// should be increased, decreased, or maintained. Always requires clinician
// approval — agents propose, doctors prescribe.
//
// Falls back to a deterministic heuristic if the LLM call fails:
//   improving outcomes → maintain
//   worsening outcomes → small dose increase
//   no recent data    → request more logging (maintain)
// ---------------------------------------------------------------------------

const input = z.object({
  patientId: z.string(),
  regimenId: z.string(),
});

const output = z.object({
  recommendation: z.enum(["increase", "decrease", "maintain"]),
  suggestedDose: z.number().optional(),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
});

export type TitrationSuggestion = z.infer<typeof output>;

// Compute the slope of the most relevant outcome metric over the lookback
// window. Positive slope = values rising; negative = values falling. We
// pair this with a "lower is better" flag per metric to derive direction.
function computeOutcomeTrend(
  logs: { metric: string; value: number; loggedAt: Date }[],
): { metric: string | null; direction: "improving" | "worsening" | "flat" | "none" } {
  if (logs.length < 3) return { metric: null, direction: "none" };

  const lowerIsBetter = new Set(["pain", "anxiety", "nausea"]);

  // Pick the metric with the most logs.
  const counts = new Map<string, number>();
  for (const l of logs) counts.set(l.metric, (counts.get(l.metric) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top || top[1] < 3) return { metric: null, direction: "none" };

  const metric = top[0];
  const series = logs
    .filter((l) => l.metric === metric)
    .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime())
    .map((l) => l.value);

  const n = series.length;
  const xs = Array.from({ length: n }, (_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = series.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - meanX) * (series[i] - meanY);
    den += (xs[i] - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;

  if (Math.abs(slope) < 0.05) return { metric, direction: "flat" };

  const valuesRising = slope > 0;
  const isWorsening = lowerIsBetter.has(metric) ? valuesRising : !valuesRising;
  return { metric, direction: isWorsening ? "worsening" : "improving" };
}

export const titrationAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: "titration",
  version: "1.0.0",
  description:
    "Suggests whether a dosing regimen should be increased, decreased, or " +
    "maintained based on recent outcome trends. Requires clinician approval.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "read.encounter", "write.outcome.reminder"],
  requiresApproval: true,

  async run({ patientId, regimenId }, ctx) {
    ctx.assertCan("read.patient");

    const regimen = await prisma.dosingRegimen.findFirst({
      where: { id: regimenId, patientId, active: true },
      include: { product: true, patient: true },
    });
    if (!regimen) throw new Error(`Active regimen ${regimenId} not found for patient ${patientId}`);

    const since = new Date(Date.now() - 30 * 86_400_000);
    const logs = await prisma.outcomeLog.findMany({
      where: { patientId, loggedAt: { gte: since } },
      orderBy: { loggedAt: "asc" },
      take: 200,
    });

    const trend = computeOutcomeTrend(
      logs.map((l) => ({ metric: l.metric as string, value: l.value, loggedAt: l.loggedAt })),
    );

    ctx.log("info", "Outcome trend computed", trend);

    const currentDose = regimen.volumePerDose;
    const productName = regimen.product?.name ?? "this product";
    const outcomeSummary =
      logs.length === 0
        ? "No outcome logs in the last 30 days."
        : `${logs.length} logs in the last 30 days. Trend on ${trend.metric ?? "outcomes"}: ${trend.direction}.`;

    const prompt = `You are a cannabis titration specialist at Leafjourney. Suggest whether to increase, decrease, or maintain the current dose.

PATIENT: ${regimen.patient.firstName} ${regimen.patient.lastName}
PRODUCT: ${productName}
CURRENT REGIMEN: ${currentDose} ${regimen.volumeUnit} per dose, ${regimen.frequencyPerDay}x/day
THC PER DOSE: ${regimen.calculatedThcMgPerDose ?? "?"}mg · CBD PER DOSE: ${regimen.calculatedCbdMgPerDose ?? "?"}mg
RECENT OUTCOMES: ${outcomeSummary}

Return ONLY a JSON object matching this exact shape:
{ "recommendation": "increase|decrease|maintain", "suggestedDose": <number or null>, "reasoning": "1-2 sentences", "confidence": 0.0-1.0 }

Guidelines:
- Start low, go slow — if increasing, no more than +25% per step
- If recent outcomes are improving, prefer maintain
- If outcomes are worsening, consider a small increase or a route/timing change
- Be conservative. The clinician will review this suggestion before any change.`;

    let raw = "";
    try {
      raw = await ctx.model.complete(prompt, {
        maxTokens: 400,
        temperature: 0.2,
        redactNames: [regimen.patient.firstName, regimen.patient.lastName].filter(Boolean),
      });
    } catch (err) {
      ctx.log("warn", "Model call failed; falling back to deterministic heuristic", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const rec = ["increase", "decrease", "maintain"].includes(parsed.recommendation)
          ? (parsed.recommendation as "increase" | "decrease" | "maintain")
          : "maintain";
        const result: TitrationSuggestion = {
          recommendation: rec,
          suggestedDose:
            typeof parsed.suggestedDose === "number" ? parsed.suggestedDose : undefined,
          reasoning: String(parsed.reasoning ?? "").trim() || "Model returned no reasoning.",
          confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.5))),
        };
        return result;
      } catch {
        // fall through to deterministic
      }
    }

    // ── Deterministic fallback ──────────────────────────────────
    if (trend.direction === "none") {
      return {
        recommendation: "maintain",
        reasoning:
          "Not enough recent logs to make a confident suggestion. Encourage daily check-ins for two weeks before adjusting.",
        confidence: 0.3,
      };
    }
    if (trend.direction === "improving" || trend.direction === "flat") {
      return {
        recommendation: "maintain",
        suggestedDose: currentDose,
        reasoning: `Recent ${trend.metric ?? "outcome"} trend is ${trend.direction}. The current regimen appears to be working — hold steady and reassess at the next visit.`,
        confidence: 0.7,
      };
    }
    // worsening
    const bumped = Math.round(currentDose * 1.25 * 100) / 100;
    return {
      recommendation: "increase",
      suggestedDose: bumped,
      reasoning: `${trend.metric ?? "Outcomes"} are worsening over the last few weeks. Consider a small step up to ${bumped} ${regimen.volumeUnit} per dose, with a 7-day reassessment.`,
      confidence: 0.55,
    };
  },
};
