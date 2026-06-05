import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { ensureConsentDisclaimerBlock } from "@/lib/clinical/ai-consent-disclaimer";
import { startReasoning } from "./memory/agent-reasoning";
import { formatPersonaForPrompt, resolvePersona } from "./persona";
import {
  recallMemories,
  recordMemory,
  formatMemoriesForPrompt,
} from "./memory/patient-memory";
import {
  recallObservations,
  formatObservationsForPrompt,
} from "./memory/clinical-observation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function tryParseJSON(text: string): any | null {
  const jsonMatch =
    text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    text.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  } catch {
    return null;
  }
}

/**
 * Compute age in whole years from a Date of Birth.
 */
function ageFromDob(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const monthDiff = now.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Format an array of OutcomeLog rows into a readable trend string.
 */
function formatOutcomeTrend(
  logs: { metric: string; value: number; loggedAt: Date }[]
): string {
  if (logs.length === 0) return "No recent data";
  return logs
    .map(
      (l) =>
        `${l.loggedAt.toISOString().slice(0, 10)}: ${l.value.toFixed(1)}/10`
    )
    .join(", ");
}

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const input = z.object({ encounterId: z.string() });

const blockSchema = z.object({
  type: z.enum(["summary", "findings", "assessment", "plan", "followUp"]),
  heading: z.string(),
  body: z.string(),
  metadata: z.record(z.unknown()).optional(),
});

const output = z.object({
  noteId: z.string(),
  blocks: z.array(blockSchema),
  confidence: z.number().min(0).max(1),
  suggestedCodes: z
    .array(z.object({ code: z.string(), label: z.string() }))
    .optional(),
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/**
 * Scribe Agent v2
 * ---------------
 * Drafts a structured visit note from encounter context using an LLM prompt.
 * Builds rich patient context, requests structured JSON output, and falls back
 * gracefully when the model returns plain text (e.g. StubModelClient).
 *
 * The note is always written as `status = draft` and is never finalized
 * without a clinician signature. Workflow step is approval-gated.
 */
export const scribeAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "scribe",
  version: "2.0.0",
  description: "Drafts a structured visit note from encounter context.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: [
    "read.encounter",
    "read.patient",
    "read.note",
    "write.note.draft",
  ],
  requiresApproval: true,

  async run({ encounterId }, ctx) {
    // Reasoning trace is started at the top so every decision point
    // gets captured for the physician's "explain why" view.
    const trace = startReasoning("scribe", "1.0.0", ctx.jobId);
    trace.step("begin scribe draft", { encounterId });

    // ------------------------------------------------------------------
    // 1. Load encounter + patient + chart summary
    // ------------------------------------------------------------------
    ctx.assertCan("read.encounter");

    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        patient: { include: { chartSummary: true } },
      },
    });
    if (!encounter) throw new Error(`Encounter not found: ${encounterId}`);
    trace.step("loaded encounter", {
      patientId: encounter.patientId,
      modality: encounter.modality,
    });

    const patient = encounter.patient;
    ctx.assertCan("read.patient");

    // ── Step 1b: Recall memories and observations about the patient ──
    const memories = await recallMemories(patient.id, {
      kinds: [
        "concern",
        "working",
        "not_working",
        "preference",
        "trajectory",
        "observation",
      ],
      limit: 24,
    });
    trace.step("recalled patient memories", {
      count: memories.length,
      kinds: [...new Set(memories.map((m) => m.kind))],
    });
    trace.source(
      "memories",
      memories.map((m) => m.id),
    );

    const recentObservations = await recallObservations(patient.id, {
      onlyUnacknowledged: true,
      limit: 8,
    });
    trace.step("recalled recent observations", {
      count: recentObservations.length,
      urgentCount: recentObservations.filter((o) => o.severity === "urgent").length,
    });
    trace.source(
      "observations",
      recentObservations.map((o) => o.id),
    );

    const memoryBlock = formatMemoriesForPrompt(memories);
    const observationsBlock = formatObservationsForPrompt(recentObservations);

    // Vulnerability detection — drives the safety-rules block below and the
    // confidence ceiling. A note for a vulnerable patient (pediatric,
    // pregnant, psych-contraindicated, severe cardiac) must carry explicit
    // ⚠ flags and cannabis should NOT appear in Plan without human review.
    const ageNow = patient.dateOfBirth
      ? ageFromDob(patient.dateOfBirth)
      : null;
    const isPediatric = ageNow !== null && ageNow < 18;

    const vulnHaystack = [
      patient.presentingConcerns ?? "",
      patient.treatmentGoals ?? "",
      (patient.contraindications ?? []).join(" "),
      patient.chartSummary?.summaryMd ?? "",
      typeof patient.cannabisHistory === "string"
        ? patient.cannabisHistory
        : JSON.stringify(patient.cannabisHistory ?? {}),
    ]
      .join(" ")
      .toLowerCase();

    const vulnerabilityFlags: string[] = [];
    if (isPediatric) vulnerabilityFlags.push("pediatric (<18)");
    if (
      vulnHaystack.includes("bipolar i") ||
      vulnHaystack.includes("bipolar 1") ||
      vulnHaystack.includes("mania")
    )
      vulnerabilityFlags.push("bipolar I / mania");
    if (
      vulnHaystack.includes("schizophren") ||
      vulnHaystack.includes("psychosis") ||
      vulnHaystack.includes("psychotic")
    )
      vulnerabilityFlags.push("schizophrenia / active psychosis");
    if (vulnHaystack.includes("pregnan") || vulnHaystack.includes("gravid"))
      vulnerabilityFlags.push("pregnancy");
    if (vulnHaystack.includes("breastfeed") || vulnHaystack.includes("lactation"))
      vulnerabilityFlags.push("lactation");
    if (
      vulnHaystack.includes("unstable angina") ||
      vulnHaystack.includes("recent mi") ||
      vulnHaystack.includes("myocardial infarction") ||
      vulnHaystack.includes("heart failure") ||
      vulnHaystack.includes("cardiomyopathy")
    )
      vulnerabilityFlags.push("severe cardiac disease");

    // Allergies block — normalized with NKDA default. This rides at the
    // TOP of the scribe prompt so the LLM can never miss it.
    const allergiesList = (patient.allergies ?? []).filter((a) => a && a.trim().length > 0);
    const allergiesBlock =
      allergiesList.length > 0
        ? `ALLERGIES (⚠ DO NOT recommend products containing these or cross-reactants):\n  - ${allergiesList.join("\n  - ")}`
        : "ALLERGIES: NKDA (no known drug allergies on file)";

    trace.step("allergy + vulnerability scan", {
      allergyCount: allergiesList.length,
      vulnerabilityFlags,
    });

    // ------------------------------------------------------------------
    // 2. Fetch recent outcome trends (last 5 per metric)
    // ------------------------------------------------------------------
    const metricsOfInterest = ["pain", "sleep", "anxiety"] as const;

    const outcomeLogs = await prisma.outcomeLog.findMany({
      where: {
        patientId: patient.id,
        metric: { in: [...metricsOfInterest] },
      },
      orderBy: { loggedAt: "desc" },
      take: 15, // up to 5 per metric
    });

    const trendsByMetric: Record<string, string> = {};
    for (const metric of metricsOfInterest) {
      const logs = outcomeLogs
        .filter((l) => l.metric === metric)
        .slice(0, 5);
      trendsByMetric[metric] = formatOutcomeTrend(logs);
    }

    // ------------------------------------------------------------------
    // 3. Fetch prior finalized notes (limit 2)
    // ------------------------------------------------------------------
    ctx.assertCan("read.note");

    const priorNotes = await prisma.note.findMany({
      where: {
        encounter: { patientId: patient.id },
        status: "finalized",
      },
      orderBy: { finalizedAt: "desc" },
      take: 2,
      select: { blocks: true, finalizedAt: true },
    });

    const priorNotesText =
      priorNotes.length > 0
        ? priorNotes
            .map((n, i) => {
              const date = n.finalizedAt
                ? n.finalizedAt.toISOString().slice(0, 10)
                : "unknown date";
              const blocks = Array.isArray(n.blocks) ? n.blocks : [];
              const blockText = blocks
                .map((b: any) => `  ${b.heading ?? b.type}: ${b.body}`)
                .join("\n");
              return `--- Prior Note ${i + 1} (${date}) ---\n${blockText}`;
            })
            .join("\n\n")
        : "No prior finalized notes available.";

    // ------------------------------------------------------------------
    // 4. Build patient context string
    // ------------------------------------------------------------------
    const agePart = patient.dateOfBirth
      ? `${ageFromDob(patient.dateOfBirth)} years old`
      : "age unknown";

    const locationPart = [patient.city, patient.state]
      .filter(Boolean)
      .join(", ");

    const cannabisHistory = patient.cannabisHistory
      ? typeof patient.cannabisHistory === "string"
        ? patient.cannabisHistory
        : JSON.stringify(patient.cannabisHistory, null, 2)
      : "No cannabis history on file.";

    const summaryMd =
      patient.chartSummary?.summaryMd ?? "No chart summary yet.";

    const patientContext = `
${allergiesBlock}

PATIENT: ${patient.firstName} ${patient.lastName}, ${agePart}${locationPart ? `, ${locationPart}` : ""}

PRESENTING CONCERNS: ${patient.presentingConcerns ?? "Not documented"}

TREATMENT GOALS: ${patient.treatmentGoals ?? "Not documented"}

WHAT WE ALREADY KNOW ABOUT THIS PERSON (longitudinal memory):
${memoryBlock}

WHAT THE CARE TEAM HAS BEEN NOTICING RECENTLY:
${observationsBlock}

CANNABIS HISTORY:
${cannabisHistory}

RECENT OUTCOME TRENDS (last 5 readings, scale 0-10):
  Pain:    ${trendsByMetric.pain}
  Sleep:   ${trendsByMetric.sleep}
  Anxiety: ${trendsByMetric.anxiety}

CHART SUMMARY:
${summaryMd}

ENCOUNTER:
  Modality: ${encounter.modality}
  Reason: ${encounter.reason ?? "Not specified"}

PRIOR FINALIZED NOTES:
${priorNotesText}
`.trim();

    // ------------------------------------------------------------------
    // 4b. Check for pre-visit briefing context on the encounter
    // ------------------------------------------------------------------
    const briefing = encounter.briefingContext as {
      patientSummary?: string;
      talkingPoints?: string[];
      riskFlags?: string[];
      sections?: Array<{ title: string; content: string; priority: string }>;
    } | null;

    let briefingPromptSection = "";
    if (briefing) {
      const parts: string[] = ["PRE-VISIT INTELLIGENCE BRIEFING (use this to inform the note):"];
      if (briefing.patientSummary) {
        parts.push(`  Summary: ${briefing.patientSummary}`);
      }
      if (briefing.riskFlags?.length) {
        parts.push(`  RISK FLAGS: ${briefing.riskFlags.join("; ")}`);
      }
      if (briefing.talkingPoints?.length) {
        parts.push(`  Talking points: ${briefing.talkingPoints.join("; ")}`);
      }
      if (briefing.sections?.length) {
        const highPriority = briefing.sections.filter((s) => s.priority === "high" || s.priority === "medium");
        if (highPriority.length > 0) {
          parts.push(`  Key findings: ${highPriority.map((s) => `${s.title}: ${s.content}`).join("; ")}`);
        }
      }
      briefingPromptSection = "\n\n" + parts.join("\n");
      ctx.log("info", "Briefing context found — injecting into scribe prompt", {
        talkingPoints: briefing.talkingPoints?.length ?? 0,
        riskFlags: briefing.riskFlags?.length ?? 0,
      });
    }

    // ------------------------------------------------------------------
    // 5. Compose the prompt and call the model
    // ------------------------------------------------------------------
    const prompt = `You are an AI medical scribe assistant for a cannabis care practice. Draft a clinical visit note based on the patient context below.

${patientContext}${briefingPromptSection}

Return ONLY valid JSON in this exact format:
{
  "summary": "Brief 1-2 sentence overview of the visit",
  "findings": "Key relevant findings from the patient's history and current status",
  "assessment": "Clinical assessment of the patient's current condition and response to treatment",
  "plan": "Specific treatment plan recommendations including cannabis guidance",
  "followUp": "Follow-up schedule and any pending actions",
  "suggestedCodes": [
    { "code": "ICD-10 code", "label": "Description" }
  ],
  "confidence": 0.85,
  "newMemory": null | { "kind": "preference" | "observation" | "trajectory" | "working" | "not_working" | "concern", "content": "1-2 sentence narrative to remember about this patient going forward", "tags": ["..."] }
}

Important guidelines:
- Be concise but thorough
- Use clinical language appropriate for a medical record
- Base cannabis recommendations on the patient's reported history and outcomes
- Include relevant ICD-10 codes in suggestedCodes
- Set confidence between 0.0 and 1.0 based on how much context was available
- If a PRE-VISIT INTELLIGENCE BRIEFING is provided above, USE IT: incorporate the risk flags into the Assessment, the talking points into the Plan, and reference trend data in the Findings. The briefing represents the physician's pre-visit analysis.
- If this visit reveals anything worth remembering about the patient (preference, working/not working interventions, new concerns, etc.), capture it in newMemory. Otherwise, return null.

Non-negotiable safety rules (these OVERRIDE every other guideline):
1. Allergies are absolute. Never recommend a product that contains a listed allergen or a known cross-reactant. If a proposed product might contain an allergen, write "-- to be confirmed with the physician --" instead of the product name.
2. When the chart does not clearly support a specific clinical fact (dose, trend, diagnosis, response), write "-- to be confirmed --" rather than inventing one. Invention is a worse outcome than a gap.
3. All symptom findings must use the OLDCARTS scaffolding (Onset, Location, Duration, Character, Aggravating, Relieving, Timing, Severity). If a dimension is missing, call it out as "-- to be confirmed --" instead of omitting it silently.
4. If ANY of the following are present in the chart, start the Assessment block with "⚠" and do NOT recommend cannabis in Plan without an explicit physician review gate: bipolar I, schizophrenia, pregnancy, active psychosis, severe cardiac disease, pediatric (under 18).
   ${vulnerabilityFlags.length > 0 ? `CURRENT PATIENT VULNERABILITIES (flag them explicitly): ${vulnerabilityFlags.join(", ")}.` : "No vulnerability flags in the chart at this time."}
5. Never upcode or inflate severity. The note must match what the chart supports — no more.`;

    // Prepend the shared scribe persona voice profile so the documentation
    // tone comes from one central place (persona.ts).
    const personaBlock = formatPersonaForPrompt(resolvePersona("scribe"));
    const promptWithPersona = `${personaBlock}\n\n${prompt}`;

    ctx.log("info", "Sending prompt to model", {
      promptLength: promptWithPersona.length,
    });
    trace.step("built prompt", { promptLength: promptWithPersona.length });

    // Call the LLM, but gracefully fall back to a deterministic template
    // if the model fails (credits, timeout, network). We still create a
    // draft note so the clinician always sees something after Start Visit.
    let modelResponse = "";
    try {
      modelResponse = await ctx.model.complete(promptWithPersona, {
        maxTokens: 1024,
        temperature: 0.3,
        redactNames: [patient.firstName, patient.lastName].filter(Boolean),
      });
      trace.step("llm complete", { rawLen: modelResponse.length });
    } catch (err) {
      ctx.log("warn", "Scribe LLM call failed — using deterministic draft", {
        error: err instanceof Error ? err.message : String(err),
      });
      trace.step("llm failed — using deterministic fallback");
      modelResponse = "";
    }

    // ------------------------------------------------------------------
    // 6. Parse model response (structured JSON or fallback)
    // ------------------------------------------------------------------
    const parsed = tryParseJSON(modelResponse);

    let confidence: number;
    let suggestedCodes: { code: string; label: string }[] = [];
    let blocks: z.infer<typeof blockSchema>[];

    // Evidence density: how much actual chart context did we feed the model?
    // A 0.95-confidence assessment drafted from nothing is the worst failure
    // mode — the ceiling guarantees it can't happen.
    const briefingSectionCount = briefing?.sections?.length ?? 0;
    const evidenceUnits =
      priorNotes.length +
      outcomeLogs.length +
      (patient.chartSummary ? 1 : 0) +
      briefingSectionCount +
      (patient.presentingConcerns ? 1 : 0);
    const densityCeiling =
      evidenceUnits >= 10 ? 0.9
        : evidenceUnits >= 6 ? 0.8
          : evidenceUnits >= 3 ? 0.65
            : 0.4;
    trace.step("computed evidence density ceiling", {
      evidenceUnits,
      densityCeiling,
    });

    if (parsed && typeof parsed === "object" && parsed.assessment) {
      // Successful structured parse
      confidence =
        typeof parsed.confidence === "number"
          ? Math.max(0, Math.min(1, parsed.confidence))
          : 0.7;
      if (confidence > densityCeiling) {
        trace.alternative(
          "trust LLM's self-reported confidence",
          `model reported ${confidence.toFixed(2)} but only ${evidenceUnits} evidence units were available; capping at ${densityCeiling.toFixed(2)}.`,
        );
        confidence = densityCeiling;
      }

      suggestedCodes = Array.isArray(parsed.suggestedCodes)
        ? parsed.suggestedCodes
            .filter(
              (c: any) =>
                typeof c === "object" &&
                typeof c.code === "string" &&
                typeof c.label === "string"
            )
            .map((c: any) => ({ code: c.code, label: c.label }))
        : [];

      blocks = [
        {
          type: "summary" as const,
          heading: "Summary",
          body:
            parsed.summary ??
            `${patient.firstName} ${patient.lastName} presented for a ${encounter.modality} visit. ${encounter.reason ?? ""}`.trim(),
        },
        {
          type: "findings" as const,
          heading: "Relevant findings",
          body: parsed.findings ?? summaryMd,
        },
        {
          type: "assessment" as const,
          heading: "Assessment",
          body: parsed.assessment,
        },
        {
          type: "plan" as const,
          heading: "Plan",
          body: parsed.plan ?? "-- draft, pending clinician input --",
        },
        {
          type: "followUp" as const,
          heading: "Follow-up",
          body:
            parsed.followUp ?? "Schedule outcome check-in at 7 days.",
        },
      ];

      // Attach suggestedCodes as metadata on the assessment block
      if (suggestedCodes.length > 0) {
        blocks[2] = { ...blocks[2], metadata: { suggestedCodes } };
      }

      ctx.log("info", "Parsed structured JSON from model", {
        confidence,
        codeCount: suggestedCodes.length,
      });
    } else {
      // Fallback: model returned plain text (e.g. StubModelClient). A
      // fallback-path draft is by definition under-grounded — cap at 0.5
      // so it can never auto-finalize without physician review, then let
      // the density ceiling drop it further when evidence is also sparse.
      confidence = Math.min(0.5, densityCeiling);

      blocks = [
        {
          type: "summary" as const,
          heading: "Summary",
          body: `${patient.firstName} ${patient.lastName} presented for a ${encounter.modality} visit. ${encounter.reason ?? ""}`.trim(),
        },
        {
          type: "findings" as const,
          heading: "Relevant findings",
          body: summaryMd,
        },
        {
          type: "assessment" as const,
          heading: "Assessment",
          body: modelResponse,
        },
        {
          type: "plan" as const,
          heading: "Plan",
          body: "-- draft, pending clinician input --",
        },
        {
          type: "followUp" as const,
          heading: "Follow-up",
          body: "Schedule outcome check-in at 7 days.",
        },
      ];

      ctx.log("info", "Model returned plain text; using fallback blocks");
    }

    // ------------------------------------------------------------------
    // 7. Persist the draft note
    // ------------------------------------------------------------------
    ctx.assertCan("write.note.draft");

    // EMR-784: Voice/ambient AI scribe drafts must always carry the
    // patient verbal-consent disclaimer.
    blocks = ensureConsentDisclaimerBlock(blocks);

    const note = await prisma.note.create({
      data: {
        encounterId,
        status: "draft",
        aiDrafted: true,
        aiConfidence: confidence,
        blocks: blocks as any,
      },
    });

    await writeAgentAudit(
      "scribe",
      "2.0.0",
      encounter.organizationId,
      "note.drafted",
      { type: "Note", id: note.id },
      { encounterId, confidence, suggestedCodeCount: suggestedCodes.length }
    );

    ctx.log("info", "Note draft created", { noteId: note.id, confidence });

    // ── Step 8: Write a new memory if the LLM flagged something worth remembering ──
    if (parsed && typeof parsed === "object" && parsed.newMemory) {
      try {
        await recordMemory({
          patientId: patient.id,
          kind: parsed.newMemory.kind,
          content: parsed.newMemory.content,
          tags: parsed.newMemory.tags ?? [],
          source: "scribe",
          sourceKind: "agent",
          confidence: 0.65,
          metadata: {
            derivedFromEncounterId: encounterId,
            noteId: note.id,
          },
        });
        trace.step("recorded new patient memory", {
          kind: parsed.newMemory.kind,
        });
      } catch (err) {
        ctx.log("warn", "Failed to record patient memory in Scribe", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    trace.conclude({
      confidence,
      summary: `Drafted a ${blocks.length}-block SOAP note at ${Math.round(confidence * 100)}% confidence. ${suggestedCodes.length > 0 ? `Suggested ${suggestedCodes.length} ICD-10 codes.` : ""}${parsed?.newMemory ? " Recorded new patient memory." : ""}`,
    });
    await trace.persist();

    return {
      noteId: note.id,
      blocks,
      confidence,
      ...(suggestedCodes.length > 0 ? { suggestedCodes } : {}),
    };
  },
};
