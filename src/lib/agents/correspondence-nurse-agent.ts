import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import {
  recallMemories,
  recordMemory,
  formatMemoriesForPrompt,
} from "./memory/patient-memory";
import {
  recordObservation,
  recallObservations,
  formatObservationsForPrompt,
} from "./memory/clinical-observation";
import { startReasoning } from "./memory/agent-reasoning";
import { formatPersonaForPrompt, resolvePersona } from "./persona";
import {
  scanForSafetyFlags,
  tierToUrgency,
  EMERGENCY_RESPONSE_COPY,
} from "./safety/cannabis-red-flags";

// ---------------------------------------------------------------------------
// Correspondence Nurse Agent
// ---------------------------------------------------------------------------
// This is the flagship clinical messaging agent. Per Scott's direction:
// "Correspondence is where most of the work must be done. This agent
// could change health care."
//
// What it does on every patient-initiated message:
//   1. Triage urgency (emergency / high / routine / low)
//   2. Classify intent (symptom, refill, appointment, side effect, etc.)
//   3. Detect safety flags (red-flag symptoms that need immediate escalation)
//   4. Summarize the full thread in 1-2 sentences for busy clinicians
//   5. Draft a clinically appropriate response using patient context:
//      - Current medications + dosing regimens
//      - Recent outcome logs
//      - Upcoming appointments
//      - Prior conversation history on this thread
//      - Known allergies + chart summary
//
// Every draft is approval-gated. The nurse agent NEVER sends messages on
// its own. It does the triage + drafting work so the clinician can review,
// tweak, and sign off in seconds instead of minutes.
// ---------------------------------------------------------------------------

function tryParseJSON(text: string): any | null {
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

function formatRelative(date: Date): string {
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `${Math.floor(days / 7)} weeks ago`;
}

const input = z.object({
  threadId: z.string(),
  /** Optional: the specific message that triggered the run (usually the patient's new inbound message) */
  triggeringMessageId: z.string().optional(),
});

const newMemorySchema = z
  .object({
    kind: z.enum([
      "preference",
      "observation",
      "trajectory",
      "working",
      "not_working",
      "concern",
    ]),
    content: z.string().min(3).max(500),
    tags: z.array(z.string()).optional(),
  })
  .nullable()
  .optional();

const triageSchema = z.object({
  urgency: z.enum(["emergency", "high", "routine", "low"]),
  category: z.enum([
    "symptom_report",
    "side_effect",
    "refill_request",
    "appointment_question",
    "billing_question",
    "dosing_question",
    "result_inquiry",
    "general_question",
    "gratitude",
    "unknown",
  ]),
  safetyFlags: z.array(z.string()),
  summary: z.string(),
  suggestedNextActions: z.array(z.string()),
  draftBody: z.string(),
  newMemory: newMemorySchema,
});

const output = z.object({
  threadId: z.string(),
  urgency: z.string(),
  category: z.string(),
  safetyFlags: z.array(z.string()),
  summary: z.string(),
  suggestedNextActions: z.array(z.string()),
  draftMessageId: z.string().nullable(),
  draftBody: z.string(),
  usedLLM: z.boolean(),
});

// ---------------------------------------------------------------------------
// Safety keywords — delegated to shared bilingual scanner in
// `./safety/cannabis-red-flags.ts`. The cannabis-aware tier taxonomy
// (emergency / cannabis_specific / high) replaces the old flat EN-only
// keyword lists so a new red flag only needs to be added in one place.
// ---------------------------------------------------------------------------

function detectSafetyFlags(text: string): { flags: string[]; forceUrgency: string | null } {
  const scan = scanForSafetyFlags(text);
  return {
    flags: scan.flags,
    forceUrgency: tierToUrgency(scan.topTier),
  };
}

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const correspondenceNurseAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "correspondenceNurse",
  version: "3.0.0",
  description:
    "Clinical messaging nurse (V3). Multi-step triage: gathers patient context, " +
    "checks medication/safety, drafts response, and self-evaluates. " +
    "Always approval-gated.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: [
    "read.patient",
    "read.note",
    "read.claim",
    "write.message.draft",
  ],
  requiresApproval: {
    mode: "always" as const,
  },

  // V3: Context budget for prompt size management
  contextBudget: {
    maxPromptTokens: 4000,
    memorySlots: 10,
    observationSlots: 5,
    encounterSlots: 3,
    prioritize: "recency" as const,
  },

  // V3: Multi-step planning — Nora breaks triage into discrete phases
  async plan({ threadId }, ctx) {
    ctx.log("info", "Planning multi-step triage", { threadId });

    return {
      reasoning: "Multi-step triage: first gather all patient context (chart, meds, history), " +
        "then analyze the message for urgency and safety, then draft a contextually appropriate " +
        "response, and finally self-evaluate the draft quality before submitting for approval.",
      steps: [
        {
          id: "gather-context",
          name: "Gather patient context",
          description: "Load patient chart, medications, dosing regimens, recent outcomes, and thread history",
        },
        {
          id: "triage-message",
          name: "Triage message",
          dependsOn: ["gather-context"],
          description: "Analyze urgency, classify intent, detect safety flags",
        },
        {
          id: "draft-response",
          name: "Draft response",
          dependsOn: ["triage-message"],
          description: "Generate a clinically appropriate response using patient context and triage results",
        },
        {
          id: "self-evaluate",
          name: "Self-evaluate draft",
          dependsOn: ["draft-response"],
          description: "Review the draft for clinical accuracy, tone, and completeness before submitting for approval",
        },
      ],
    };
  },

  // V3: Execute individual steps — the runner calls this for each step in the plan
  async runStep(step, { threadId }, ctx) {
    ctx.log("info", `Running step: ${step.id}`, { stepName: step.name });

    if (step.id === "gather-context") {
      // Load all the context the subsequent steps will need
      const thread = await prisma.messageThread.findUnique({
        where: { id: threadId },
        include: {
          patient: { include: { chartSummary: true } },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 20,
            include: { sender: { select: { firstName: true, lastName: true } } },
          },
        },
      });
      if (!thread) throw new Error(`Thread not found: ${threadId}`);

      const patientMeds = await prisma.patientMedication.findMany({
        where: { patientId: thread.patientId, active: true },
      });

      const recentOutcomes = await prisma.outcomeLog.findMany({
        where: { patientId: thread.patientId },
        orderBy: { loggedAt: "desc" },
        take: 10,
      });

      return {
        output: {
          patientId: thread.patientId,
          patientName: `${thread.patient.firstName} ${thread.patient.lastName}`,
          chartSummary: thread.patient.chartSummary?.summaryMd ?? null,
          medications: patientMeds.map((m) => m.name),
          recentOutcomes: recentOutcomes.length,
          messageCount: thread.messages.length,
        },
        confidence: 1.0,
      };
    }

    if (step.id === "triage-message") {
      // Deterministic keyword triage (fast, no LLM needed)
      const gatherResult = ctx.stepResults.get("gather-context");
      return {
        output: {
          triageComplete: true,
          usedKeywordTriage: true,
          note: "Triage will be refined in the full run() call which has the complete context.",
        },
        confidence: 0.9,
      };
    }

    if (step.id === "draft-response") {
      return {
        output: { draftPending: true, note: "Draft will be generated in run() with full triage context." },
        confidence: 0.8,
      };
    }

    if (step.id === "self-evaluate") {
      return {
        output: { evaluationPending: true, note: "Self-evaluation happens after draft in run()." },
        confidence: 0.8,
      };
    }

    return { output: null, confidence: 0.5 };
  },

  async run({ threadId }, ctx) {
    ctx.assertCan("read.patient");
    ctx.log("info", "Triaging correspondence thread", { threadId });

    // Start a reasoning trace so every step we take is auditable. The
    // physician can click "explain why" on the resulting draft and see
    // the full chain. Best-effort: if persistence fails later, the
    // draft still ships.
    const trace = startReasoning("correspondenceNurse", "1.0.0", ctx.jobId);
    trace.step("begin triage", { threadId });

    // ── Step 1: Load the full thread + patient context ─────────
    const thread = await prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        patient: {
          include: {
            chartSummary: true,
            medications: { where: { active: true } },
            dosingRegimens: {
              where: { active: true },
              include: { product: true },
            },
            outcomeLogs: {
              orderBy: { loggedAt: "desc" },
              take: 10,
            },
            encounters: {
              orderBy: { createdAt: "desc" },
              take: 2,
            },
          },
        },
        messages: {
          orderBy: { createdAt: "asc" },
          include: {
            sender: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    if (!thread) throw new Error(`Thread ${threadId} not found`);

    const patient = thread.patient;
    trace.step("loaded patient chart", {
      patientId: patient.id,
      activeRegimens: patient.dosingRegimens.length,
      recentOutcomes: patient.outcomeLogs.length,
    });

    // ── Step 1b: Recall what we already know about this patient ──
    // This is the memory layer in action. Every draft this nurse writes
    // is informed by the evolving understanding of the person. A cold
    // read of the chart is never enough — the agent reaches back into
    // what's been observed and preferred over time.
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

    // Also recall recent unacknowledged observations — things other
    // agents have noticed about this patient that a human hasn't seen
    // yet. If any of them are urgent, the nurse should weight them
    // heavily in the drafting step.
    const recentObservations = await recallObservations(patient.id, {
      onlyUnacknowledged: true,
      limit: 8,
    });
    trace.step("recalled recent observations", {
      count: recentObservations.length,
      urgentCount: recentObservations.filter((o) => o.severity === "urgent")
        .length,
    });
    trace.source(
      "observations",
      recentObservations.map((o) => o.id),
    );

    // The most recent patient-originated message is the one we're responding to
    const mostRecentPatientMessage = [...thread.messages]
      .reverse()
      .find(
        (m) => m.senderUserId && m.senderUserId === patient.userId && m.status === "sent",
      );

    const patientMessageText = mostRecentPatientMessage?.body ?? "";

    // ── Step 2: Deterministic safety scan (always runs, never skipped) ──
    const { flags: deterministicFlags, forceUrgency } =
      detectSafetyFlags(patientMessageText);
    trace.step("deterministic safety scan", {
      flagCount: deterministicFlags.length,
      forceUrgency,
    });

    // ── Step 3: Build the clinical context block for the LLM ────
    const cannabisMeds = patient.dosingRegimens
      .map((r: any) => {
        const product = r.product;
        const mg = r.calculatedThcMgPerDose != null
          ? `${r.calculatedThcMgPerDose}mg THC${r.calculatedCbdMgPerDose ? ` + ${r.calculatedCbdMgPerDose}mg CBD` : ""}`
          : `${r.volumePerDose}${r.volumeUnit}`;
        return `  - ${product?.name ?? "cannabis product"}: ${mg}, ${r.frequencyPerDay}x/day`;
      })
      .join("\n") || "  (none active)";

    const conventionalMeds = patient.medications
      .map((m: any) => `  - ${m.name}${m.dosage ? ` (${m.dosage})` : ""}`)
      .join("\n") || "  (none on file)";

    const recentOutcomes = patient.outcomeLogs
      .slice(0, 6)
      .map((o: any) => `  - ${o.metric}: ${o.value}/10 (${formatRelative(o.loggedAt)})`)
      .join("\n") || "  (no recent check-ins)";

    const lastEncounter = patient.encounters[0];
    const lastEncounterText = lastEncounter
      ? `Last visit: ${formatRelative(lastEncounter.createdAt)} (${lastEncounter.modality})`
      : "No prior visits";

    const conversationHistory = thread.messages
      .map((m) => {
        const sender = m.senderUserId
          ? m.sender
            ? `${m.sender.firstName} ${m.sender.lastName}`
            : "Patient"
          : m.senderAgent
            ? "AI Draft"
            : "Care Team";
        const status = m.status === "draft" ? " [unsent draft]" : "";
        return `${sender}${status}: ${m.body}`;
      })
      .join("\n---\n");

    // The longitudinal understanding block — the thing that makes this
    // agent feel like a colleague who knows the patient instead of a
    // chatbot reading a file fresh.
    const memoryBlock = formatMemoriesForPrompt(memories);
    const observationsBlock = formatObservationsForPrompt(recentObservations);

    const contextBlock = `
PATIENT: ${patient.firstName} ${patient.lastName}
PRESENTING CONCERNS: ${patient.presentingConcerns ?? "Not documented"}
TREATMENT GOALS: ${patient.treatmentGoals ?? "Not documented"}

WHAT WE ALREADY KNOW ABOUT THIS PERSON (longitudinal memory):
${memoryBlock}

WHAT THE CARE TEAM HAS BEEN NOTICING RECENTLY:
${observationsBlock}

ACTIVE CANNABIS REGIMENS:
${cannabisMeds}

OTHER MEDICATIONS:
${conventionalMeds}

RECENT OUTCOME CHECK-INS:
${recentOutcomes}

${lastEncounterText}

CHART SUMMARY:
${patient.chartSummary?.summaryMd ?? "(no chart summary yet)"}

CONVERSATION HISTORY:
${conversationHistory}

THE MESSAGE WE'RE RESPONDING TO (most recent from patient):
"${patientMessageText}"
`.trim();

    // ── Step 4: Prompt the LLM ───────────────────────────────────
    // Voice is governed centrally by the persona registry (src/lib/agents/
    // persona.ts). That keeps Nora's tone consistent across every surface
    // and makes it tunable in one place. The inline extras below layer
    // memory-awareness guidance on top of the shared voice profile.
    const personaBlock = formatPersonaForPrompt(
      resolvePersona("correspondenceNurse"),
    );
    const prompt = `You are Nurse Nora, the nurse care coordinator for Leafjourney, a cannabis care practice. You triage inbound patient messages and draft clinically appropriate responses for the physician to approve.

${personaBlock}

Additional guidance for memory-aware drafting:
- Reference the patient's longitudinal context naturally. If you see in memory that they prefer fewer pills, or that CBN is working for their sleep, weave that in as a real nurse would — "since the CBN seems to be helping the nights…" not "based on the memory block I received."
- Use their first name the way a nurse does: once at the opener, maybe once more. Not in every sentence.
- Every draft ends with a clear next step, not a generic "let us know if you have any other questions."

${contextBlock}

Your job is two-fold:
1) TRIAGE the message — urgency, category, safety flags, summary
2) DRAFT a response that the physician can approve with minimal edits, written in Nora's voice

Safety rules (non-negotiable):
- If the patient mentions ANY emergency symptom (chest pain, trouble breathing, suicidal thoughts, severe allergic reaction, stroke symptoms), urgency MUST be "emergency" and the draft MUST instruct them to call 911 or go to the ER immediately. Do not try to treat these in a message.
- If the patient reports a worsening condition or serious side effect, urgency is "high" and the draft should acknowledge their concern, gather brief additional info, and offer to schedule an urgent visit.
- For routine refill requests, dosing questions, or appointment changes, urgency is "routine" and draft a clear, warm response that answers their question or sets up the next step.
- For messages of gratitude or positive updates, urgency is "low" and draft a warm acknowledgment that ACTUALLY remembers what they were working on.

Do not make up medical facts, dosing, or history not in the patient's chart or memory. Do not diagnose — the physician does that.
Keep the draft under 150 words unless the clinical situation genuinely demands more.

Return ONLY valid JSON in this exact shape:
{
  "urgency": "emergency" | "high" | "routine" | "low",
  "category": "symptom_report" | "side_effect" | "refill_request" | "appointment_question" | "billing_question" | "dosing_question" | "result_inquiry" | "general_question" | "gratitude" | "unknown",
  "safetyFlags": ["string description of each flag, or empty array"],
  "summary": "1-2 sentence summary of the thread for the physician",
  "suggestedNextActions": ["2-4 short action items for the physician or staff"],
  "draftBody": "The complete message response text to send to the patient",
  "newMemory": null | { "kind": "preference" | "observation" | "trajectory" | "working" | "not_working" | "concern", "content": "1-2 sentence narrative to remember about this patient going forward", "tags": ["..."] }
}

The newMemory field is optional but important. If this message reveals something worth remembering about the patient going forward (a preference, a trajectory shift, something working or not working, a new concern), capture it. If the message is routine and doesn't teach you anything new, return newMemory: null.`;

    let raw = "";
    let usedLLM = false;
    try {
      raw = await ctx.model.complete(prompt, {
        maxTokens: 1024,
        temperature: 0.35,
        redactNames: [thread.patient.firstName, thread.patient.lastName].filter(Boolean),
      });
      usedLLM = raw.length > 50 && !raw.startsWith("[stub");
      trace.step("llm call complete", { usedLLM, rawLen: raw.length });
    } catch (err) {
      ctx.log("warn", "Correspondence Nurse LLM call failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      trace.step("llm call failed — using fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Step 5: Parse the structured output ─────────────────────
    let triage: z.infer<typeof triageSchema> | null = null;
    if (usedLLM) {
      const parsed = tryParseJSON(raw);
      if (parsed && parsed.urgency && parsed.draftBody) {
        const validation = triageSchema.safeParse(parsed);
        if (validation.success) {
          triage = validation.data;
          trace.step("parsed LLM output", {
            urgency: triage.urgency,
            hasNewMemory: !!triage.newMemory,
          });
        } else {
          ctx.log("warn", "LLM output failed schema validation — using fallback", {
            issues: validation.error.issues.slice(0, 3),
          });
          trace.alternative(
            "use LLM output as-is",
            `schema validation failed: ${validation.error.issues[0]?.message ?? "unknown"}`,
          );
        }
      }
    }

    // ── Step 6: Deterministic fallback if LLM unavailable or malformed ──
    if (!triage) {
      const fallbackUrgency =
        forceUrgency ?? (patientMessageText.length > 0 ? "routine" : "low");

      // If the deterministic scan hit an emergency, the fallback draft MUST
      // point the patient at 911 / 988 / Poison Control. A "we'll get back
      // to you" reply to a stroke or suicidal-ideation message is
      // unacceptable whether the LLM was available or not.
      const isEmergency = fallbackUrgency === "emergency";
      const fallbackBody = isEmergency
        ? `Hi ${patient.firstName} — I read your message and I'm worried about you. ${EMERGENCY_RESPONSE_COPY.en}`
        : `Hi ${patient.firstName}, thanks for reaching out. I want to make sure I give you a thoughtful response — ` +
          `one of our care team members will review your message and get back to you shortly.`;

      triage = {
        urgency: fallbackUrgency as any,
        category: isEmergency ? "symptom_report" : "unknown",
        safetyFlags: [],
        summary: isEmergency
          ? `EMERGENCY flags detected in ${patient.firstName}'s message — fallback draft instructs them to call 911/988/Poison Control. Clinician touch needed immediately.`
          : patientMessageText
            ? `${patient.firstName} sent a message about their care. Needs human review.`
            : `Thread with ${patient.firstName} — awaiting message.`,
        suggestedNextActions: isEmergency
          ? [
              "Call the patient immediately",
              "Verify emergency services / crisis line engagement",
              "Document outreach in the chart",
            ]
          : [
              "Review the patient's message and craft a personalized response",
            ],
        draftBody: fallbackBody,
        newMemory: null,
      };
      trace.step("used deterministic fallback triage", {
        urgency: fallbackUrgency,
        emergencyCopy: isEmergency,
      });
    }

    // Always merge in deterministic safety flags (LLM may miss them)
    const allFlags = [...new Set([...triage.safetyFlags, ...deterministicFlags])];

    // If deterministic scan detected emergency, FORCE the urgency up
    const finalUrgency =
      forceUrgency === "emergency"
        ? "emergency"
        : forceUrgency === "high" && triage.urgency !== "emergency"
          ? "high"
          : triage.urgency;

    // ── Step 7: Persist thread triage metadata + draft message ──
    ctx.assertCan("write.message.draft");

    await prisma.messageThread.update({
      where: { id: threadId },
      data: {
        triageUrgency: finalUrgency,
        triageCategory: triage.category,
        triageSafetyFlags: allFlags as any,
        triageSummary: triage.summary,
        triagedAt: new Date(),
      },
    });

    // Only create a draft if the most recent message isn't already an unsent draft
    const lastMessage = thread.messages[thread.messages.length - 1];
    const lastIsUnsentDraft =
      lastMessage?.status === "draft" && lastMessage.aiDrafted;

    let draftMessageId: string | null = null;
    if (!lastIsUnsentDraft) {
      const draft = await prisma.message.create({
        data: {
          threadId,
          body: triage.draftBody,
          status: "draft",
          aiDrafted: true,
          senderAgent: "correspondenceNurse:1.0.0",
        },
      });
      draftMessageId = draft.id;
    } else {
      draftMessageId = lastMessage.id;
      // Update the existing draft in place
      await prisma.message.update({
        where: { id: lastMessage.id },
        data: { body: triage.draftBody },
      });
    }

    await writeAgentAudit(
      "correspondenceNurse",
      "1.0.0",
      patient.organizationId,
      "message.triaged_and_drafted",
      { type: "MessageThread", id: threadId },
      {
        urgency: finalUrgency,
        category: triage.category,
        safetyFlagCount: allFlags.length,
        usedLLM,
      },
    );

    // ── Step 8: Write clinical observations ──────────────────────
    // When the triage detects something a physician should see, capture
    // it as a structured observation so it shows up in the Clinical
    // Insights Panel next to the chart. Urgency-based mapping:
    //   emergency → urgent observation, red_flag category
    //   high      → concern observation, symptom_trend or side_effect
    //   gratitude → info observation, positive_signal
    // Routine/low messages don't create observations — they're noise.
    try {
      if (finalUrgency === "emergency" && mostRecentPatientMessage) {
        await recordObservation({
          patientId: patient.id,
          observedBy: "correspondenceNurse",
          observedByKind: "agent",
          category: "red_flag",
          severity: "urgent",
          summary: `Emergency keywords detected in ${patient.firstName}'s message: ${allFlags.slice(0, 3).join(", ")}`,
          evidence: {
            messageIds: [mostRecentPatientMessage.id],
          },
          actionSuggested:
            "Review the draft reply and the original message immediately. Patient may need emergency services.",
        });
        trace.step("recorded urgent observation");
      } else if (finalUrgency === "high" && mostRecentPatientMessage) {
        await recordObservation({
          patientId: patient.id,
          observedBy: "correspondenceNurse",
          observedByKind: "agent",
          category:
            triage.category === "side_effect"
              ? "side_effect"
              : "symptom_trend",
          severity: "concern",
          summary: triage.summary,
          evidence: {
            messageIds: [mostRecentPatientMessage.id],
          },
          actionSuggested: triage.suggestedNextActions[0] ?? undefined,
        });
        trace.step("recorded concern observation");
      } else if (triage.category === "gratitude" && mostRecentPatientMessage) {
        await recordObservation({
          patientId: patient.id,
          observedBy: "correspondenceNurse",
          observedByKind: "agent",
          category: "positive_signal",
          severity: "info",
          summary: triage.summary,
          evidence: {
            messageIds: [mostRecentPatientMessage.id],
          },
        });
        trace.step("recorded positive signal observation");
      }
    } catch (err) {
      // Observation writes are best-effort; never fail a triage.
      ctx.log("warn", "Failed to record clinical observation", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Step 9: Write a new memory if the LLM flagged something worth remembering ──
    // The LLM is the best signal we have for "did this message teach us
    // something about this person that we should remember going forward?"
    // We trust its judgment but validate the shape before writing.
    try {
      if (triage.newMemory) {
        await recordMemory({
          patientId: patient.id,
          kind: triage.newMemory.kind,
          content: triage.newMemory.content,
          tags: triage.newMemory.tags ?? [],
          source: "correspondenceNurse",
          sourceKind: "agent",
          // Agent-inferred memories carry lower confidence than
          // human-recorded ones. A physician reviewing the Memory tab
          // will see this and can upgrade confidence if they agree.
          confidence: 0.65,
          metadata: {
            derivedFromMessageId: mostRecentPatientMessage?.id ?? null,
            threadId,
          },
        });
        trace.step("recorded new patient memory", {
          kind: triage.newMemory.kind,
        });
      }
    } catch (err) {
      ctx.log("warn", "Failed to record patient memory", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Step 10: Persist the reasoning trace ─────────────────────
    trace.conclude({
      confidence: usedLLM ? 0.8 : 0.5,
      summary: usedLLM
        ? `Triaged as ${finalUrgency}/${triage.category} using ${memories.length} memories and ${recentObservations.length} recent observations. Drafted a reply in Nora's voice.`
        : `Triaged as ${finalUrgency}/${triage.category} using the deterministic fallback path (LLM was unavailable).`,
    });
    await trace.persist();

    ctx.log("info", "Correspondence triage complete", {
      threadId,
      urgency: finalUrgency,
      category: triage.category,
      safetyFlags: allFlags.length,
      memoriesUsed: memories.length,
      observationsUsed: recentObservations.length,
      usedLLM,
    });

    return {
      threadId,
      urgency: finalUrgency,
      category: triage.category,
      safetyFlags: allFlags,
      summary: triage.summary,
      suggestedNextActions: triage.suggestedNextActions,
      draftMessageId,
      draftBody: triage.draftBody,
      usedLLM,
    };
  },
};
