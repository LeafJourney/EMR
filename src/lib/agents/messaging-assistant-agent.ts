import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
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

const input = z.object({
  patientId: z.string(),
  intent: z.string(),
});

const output = z.object({
  draftMessageId: z.string(),
  draftBody: z.string(),
  tone: z.enum(["warm", "formal", "direct"]),
});

const TEMPLATES: Record<string, (name: string) => string> = {
  follow_up: (name) =>
    `Hi ${name}, checking in on how things have been going since your last visit. When you have a minute, could you share how your symptoms have been this week? We're here whenever you need us.`,
  intake_nudge: (name) =>
    `Hi ${name}, we noticed your intake is almost complete. Finishing up takes just a few minutes and helps your care team prepare for your visit.`,
  appointment_confirm: (name) =>
    `Hi ${name}, this is a reminder of your upcoming visit. Please reply here if you need to reschedule — we'll make it easy.`,
};

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
 * Messaging Assistant Agent
 * -------------------------
 * Drafts routine outbound messages. Never sends — all output is stored as
 * a draft Message and requires human sign-off in Mission Control.
 */
export const messagingAssistantAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: "messagingAssistant",
  version: "1.0.0",
  description: "Drafts routine outbound patient messages for human approval.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "write.message.draft"],
  requiresApproval: true,

  async run({ patientId, intent }, ctx) {
    const trace = startReasoning("messagingAssistant", "1.0.0", ctx.jobId);
    trace.step("begin messagingAssistant draft", { patientId, intent });

    // ── Step 1: Load patient chart ──
    ctx.assertCan("read.patient");
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
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
      },
    });
    if (!patient) throw new Error(`Patient not found: ${patientId}`);
    trace.step("loaded patient chart", { patientId: patient.id });

    // ── Step 2: Recall memories + observations ──
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
    trace.step("recalled patient memories", { count: memories.length });
    trace.source(
      "memories",
      memories.map((m) => m.id),
    );

    const recentObservations = await recallObservations(patient.id, {
      onlyUnacknowledged: true,
      limit: 8,
    });
    trace.step("recalled recent observations", { count: recentObservations.length });
    trace.source(
      "observations",
      recentObservations.map((o) => o.id),
    );

    const memoryBlock = formatMemoriesForPrompt(memories);
    const observationsBlock = formatObservationsForPrompt(recentObservations);

    // ── Step 3: Build clinical context block ──
    const cannabisMeds = patient.dosingRegimens
      .map((r: any) => {
        const product = r.product;
        const mg = r.calculatedThcMgPerDose != null
          ? `${r.calculatedThcMgPerDose}mg THC${r.calculatedCbdMgPerDose ? ` + ${r.calculatedCbdMgPerDose}mg CBD` : ""}`
          : `${r.volumePerDose}${r.volumeUnit}`;
        return `  - ${product?.name ?? "cannabis product"}: ${mg}, ${r.frequencyPerDay}x/day`;
      })
      .join("\n") || "  (none active)";

    const recentOutcomes = patient.outcomeLogs
      .slice(0, 6)
      .map((o: any) => `  - ${o.metric}: ${o.value}/10`)
      .join("\n") || "  (no recent check-ins)";

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

RECENT OUTCOME CHECK-INS:
${recentOutcomes}

CHART SUMMARY:
${patient.chartSummary?.summaryMd ?? "(no chart summary yet)"}
`.trim();

    // ── Step 4: Build prompt & call model ──
    const personaBlock = formatPersonaForPrompt(
      resolvePersona("messagingAssistant"),
    );

    const prompt = `You are the Messaging Assistant for Leafjourney, a cannabis care practice. You draft routine outbound patient messages for the care team to review and send.

${personaBlock}

Intent of the message to draft: "${intent}"

Here is the patient's clinical context:
${contextBlock}

Guidelines for drafting:
- Draft a highly personalized, warm, and brief message addressing the patient's needs and current context related to the intent "${intent}".
- Avoid generic form letters. Reference what we know about the patient (their preferences, their active treatments, or how they are doing) naturally if it relates to the intent.
- Keep the message short (under 100 words), warm, and friendly.

Return ONLY valid JSON in this exact shape:
{
  "draftBody": "The complete message text to send to the patient",
  "tone": "warm" | "formal" | "direct",
  "newMemory": null | { "kind": "preference" | "observation" | "trajectory" | "working" | "not_working" | "concern", "content": "1-2 sentence narrative to remember about this patient going forward", "tags": ["..."] }
}

If drafting a message reveals or teaches you something new that we should remember about the patient going forward, capture it in newMemory; otherwise return null.`;

    let raw = "";
    let usedLLM = false;
    try {
      raw = await ctx.model.complete(prompt, {
        maxTokens: 512,
        temperature: 0.35,
        redactNames: [patient.firstName, patient.lastName].filter(Boolean),
      });
      usedLLM = raw.length > 50 && !raw.startsWith("[stub");
      trace.step("llm call complete", { usedLLM, rawLen: raw.length });
    } catch (err) {
      ctx.log("warn", "Messaging Assistant LLM call failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      trace.step("llm call failed — using fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // ── Step 5: Parse LLM output & apply fallback ──
    let responseObj: {
      draftBody: string;
      tone: "warm" | "formal" | "direct";
      newMemory?: any;
    } | null = null;

    if (usedLLM) {
      const parsed = tryParseJSON(raw);
      if (parsed && parsed.draftBody) {
        responseObj = {
          draftBody: parsed.draftBody,
          tone: parsed.tone ?? "warm",
          newMemory: parsed.newMemory ?? null,
        };
        trace.step("parsed LLM output", {
          tone: responseObj.tone,
          hasNewMemory: !!responseObj.newMemory,
        });
      }
    }

    if (!responseObj) {
      const template = TEMPLATES[intent] ?? TEMPLATES.follow_up;
      const body = template(patient.firstName);
      responseObj = {
        draftBody: body,
        tone: "warm",
        newMemory: null,
      };
      trace.step("used deterministic fallback template", { intent });
    }

    // ── Step 6: Upsert the thread and draft message ──
    const thread = await prisma.messageThread.findFirst({
      where: { patientId },
      orderBy: { lastMessageAt: "desc" },
    });

    const threadId =
      thread?.id ??
      (
        await prisma.messageThread.create({
          data: {
            patientId,
            subject: "Care team",
          },
        })
      ).id;

    ctx.assertCan("write.message.draft");
    const message = await prisma.message.create({
      data: {
        threadId,
        body: responseObj.draftBody,
        senderAgent: "messagingAssistant:1.0.0",
        aiDrafted: true,
        status: "draft",
      },
    });

    await writeAgentAudit(
      "messagingAssistant",
      "1.0.0",
      patient.organizationId,
      "message.drafted",
      { type: "Message", id: message.id },
      { intent, threadId }
    );

    ctx.log("info", "Message draft created", { messageId: message.id, intent });

    // ── Step 7: Write new memory if inferred ──
    if (responseObj.newMemory) {
      try {
        await recordMemory({
          patientId: patient.id,
          kind: responseObj.newMemory.kind,
          content: responseObj.newMemory.content,
          tags: responseObj.newMemory.tags ?? [],
          source: "messagingAssistant",
          sourceKind: "agent",
          confidence: 0.65,
          metadata: {
            derivedFromIntent: intent,
            messageId: message.id,
          },
        });
        trace.step("recorded new patient memory", {
          kind: responseObj.newMemory.kind,
        });
      } catch (err) {
        ctx.log("warn", "Failed to record patient memory in MessagingAssistant", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Step 8: Conclude reasoning trace ──
    trace.conclude({
      confidence: usedLLM ? 0.85 : 0.7,
      summary: `Drafted outbound message for intent "${intent}" using ${memories.length} memories and ${recentObservations.length} observations.${responseObj.newMemory ? " Recorded new patient memory." : ""}`,
    });
    await trace.persist();

    return {
      draftMessageId: message.id,
      draftBody: responseObj.draftBody,
      tone: responseObj.tone,
    };
  },
};
