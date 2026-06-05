import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";

// ---------------------------------------------------------------------------
// Patient Education Agent (EMR-66 + EMR-54)
// ---------------------------------------------------------------------------
// Two capabilities in one agent:
//   1. simplifyText — rewrites arbitrary clinical content at a 3rd-grade
//      reading level (EMR-54)
//   2. generateEducationSheet — builds a personalized, printable education
//      sheet based on the patient's conditions, medications, and care plan
//      (EMR-66)
// ---------------------------------------------------------------------------

const simplifyInput = z.object({
  text: z.string().min(1),
  context: z.enum(["visit_summary", "lab_result", "care_plan", "medication", "general"]),
});

const simplifyOutput = z.object({
  simplified: z.string(),
  readingLevel: z.string(),
  glossary: z.array(z.object({
    term: z.string(),
    definition: z.string(),
  })),
});

export const patientSimplifierAgent: Agent<
  z.infer<typeof simplifyInput>,
  z.infer<typeof simplifyOutput>
> = {
  name: "patientSimplifier",
  version: "1.0.0",
  description:
    "Rewrites clinical text at a 3rd-grade reading level with a warm, " +
    "supportive tone. Extracts a glossary of medical terms used.",
  inputSchema: simplifyInput,
  outputSchema: simplifyOutput,
  allowedActions: ["read.patient"],
  requiresApproval: false,

  async run({ text, context }, ctx) {
    ctx.log("info", "Simplifying clinical text", { context, length: text.length });

    const contextGuide: Record<string, string> = {
      visit_summary: "This is a visit summary from a doctor's appointment. Explain what happened during the visit and what the next steps are.",
      lab_result: "These are lab test results. Explain what each number means, whether it's normal, and why it matters — in simple terms.",
      care_plan: "This is a care plan. Explain what the patient needs to do and why, step by step.",
      medication: "This is about a medication. Explain what it does, how to take it, and what to watch out for.",
      general: "This is clinical health information. Explain it clearly.",
    };

    const prompt = `You are a patient education specialist at Leafjourney, a cannabis care clinic. Your job is to rewrite clinical content so that ANY patient can understand it — even if they only read at a 3rd-grade level.

RULES:
- Use short sentences (under 15 words each when possible)
- Use everyday words. Replace medical terms with simple explanations.
- Use "you" and "your" — speak directly to the patient.
- Be warm and reassuring, never scary. If something sounds alarming, add context.
- If a number or value is mentioned, explain what it means (is it good? bad? normal?)
- Do NOT add medical advice that isn't in the original text.
- Do NOT use phrases like "As an AI" or "consult your doctor" — we ARE the doctor's office.

CONTEXT: ${contextGuide[context] ?? contextGuide.general}

CLINICAL TEXT TO SIMPLIFY:
${text}

Return ONLY valid JSON:
{
  "simplified": "The full rewritten text at 3rd-grade reading level. Use short paragraphs. Start with the most important point.",
  "readingLevel": "3rd grade",
  "glossary": [
    { "term": "medical term used in the original", "definition": "what it means in simple words" }
  ]
}

Keep the glossary to the 5 most important terms. If there are no medical terms, return an empty glossary array.`;

    let raw = "";
    try {
      raw = await ctx.model.complete(prompt, {
        maxTokens: 1200,
        temperature: 0.3,
      });
    } catch (err) {
      ctx.log("warn", "LLM call failed — using deterministic fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Parse JSON response
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

    if (parsed?.simplified) {
      return {
        simplified: String(parsed.simplified),
        readingLevel: String(parsed.readingLevel ?? "3rd grade"),
        glossary: Array.isArray(parsed.glossary)
          ? parsed.glossary.map((g: any) => ({
              term: String(g.term ?? ""),
              definition: String(g.definition ?? ""),
            }))
          : [],
      };
    }

    // Deterministic fallback — use the plain-language module
    const { simplifyNoteSummary } = await import("@/lib/domain/plain-language");
    return {
      simplified: simplifyNoteSummary(text),
      readingLevel: "Simplified (deterministic)",
      glossary: [],
    };
  },
};

// ---------------------------------------------------------------------------
// Education Sheet Agent (EMR-66)
// ---------------------------------------------------------------------------

const educationInput = z.object({ patientId: z.string() });

const educationOutput = z.object({
  title: z.string(),
  patientName: z.string(),
  generatedAt: z.string(),
  sections: z.array(z.object({
    heading: z.string(),
    icon: z.string(),
    body: z.string(),
    tips: z.array(z.string()).optional(),
  })),
  safetyReminders: z.array(z.string()),
  glossary: z.array(z.object({
    term: z.string(),
    definition: z.string(),
  })),
});

export const patientEducationAgent: Agent<
  z.infer<typeof educationInput>,
  z.infer<typeof educationOutput>
> = {
  name: "patientEducation",
  version: "1.0.0",
  description:
    "Generates a personalized, printable patient education sheet based on " +
    "the patient's conditions, medications, and cannabis care plan.",
  inputSchema: educationInput,
  outputSchema: educationOutput,
  allowedActions: ["read.patient", "read.encounter", "read.note"],
  requiresApproval: false,

  async run({ patientId }, ctx) {
    ctx.log("info", "Generating patient education sheet", { patientId });

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        dosingRegimens: {
          where: { active: true },
          include: { product: true },
        },
        outcomeLogs: {
          orderBy: { loggedAt: "desc" },
          take: 10,
        },
        encounters: {
          orderBy: { scheduledFor: "desc" },
          take: 1,
          include: {
            notes: {
              where: { status: "finalized" },
              orderBy: { finalizedAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (!patient) throw new Error(`Patient ${patientId} not found`);

    const medications = patient.dosingRegimens.map((r: any) => {
      const p = r.product;
      return `${p?.name ?? "Cannabis product"} (${p?.productType ?? "unknown"}) — ${r.calculatedThcMgPerDose ?? 0}mg THC + ${r.calculatedCbdMgPerDose ?? 0}mg CBD, ${r.frequencyPerDay}x daily`;
    }).join("\n") || "No active medications";

    const concerns = patient.presentingConcerns ?? "Not documented";
    const goals = patient.treatmentGoals ?? "Not documented";
    const cannabis = patient.cannabisHistory as any;
    const priorUse = cannabis?.priorUse ? "Yes" : "No";

    const latestNote = (() => {
      const note = patient.encounters[0]?.notes[0];
      if (!note) return "No recent visit notes";
      const blocks = note.blocks as Array<{ type: string; body: string }>;
      return blocks.find((b) => b.type === "summary")?.body ?? "No summary available";
    })();

    const prompt = `You are a patient education specialist at Leafjourney, a cannabis care clinic. Generate a personalized education sheet for this patient.

PATIENT: ${patient.firstName} ${patient.lastName}
CONCERNS: ${concerns}
GOALS: ${goals}
PRIOR CANNABIS USE: ${priorUse}
CURRENT MEDICATIONS:
${medications}
RECENT VISIT SUMMARY: ${latestNote}

RULES:
- Write at a 3rd-grade reading level. Short sentences. Simple words.
- Be warm, personal, and reassuring.
- Use the patient's first name naturally.
- Focus on THEIR specific conditions and medications — not generic cannabis education.
- Include practical tips they can use today.
- Do NOT use "As an AI" or "consult your doctor" — we ARE the care team.
- Every section should feel relevant to THIS patient.

Return ONLY valid JSON:
{
  "title": "Your Personal Care Guide",
  "patientName": "${patient.firstName}",
  "generatedAt": "${new Date().toISOString()}",
  "sections": [
    {
      "heading": "What We're Working On Together",
      "icon": "heart",
      "body": "2-3 short paragraphs about their conditions in simple language, why they matter, and how treatment helps.",
      "tips": ["Practical tip 1", "Practical tip 2"]
    },
    {
      "heading": "Your Medications",
      "icon": "leaf",
      "body": "Explain each medication — what it does, how to take it, what to expect. Simple language.",
      "tips": ["Storage tip", "Timing tip"]
    },
    {
      "heading": "What to Watch For",
      "icon": "eye",
      "body": "Common effects (good and not-so-good) they might notice. Reassuring tone.",
      "tips": ["When to reach out to us"]
    },
    {
      "heading": "Your Goals and Progress",
      "icon": "target",
      "body": "Restate their goals in simple terms. Encourage them.",
      "tips": ["One small thing they can do this week"]
    }
  ],
  "safetyReminders": [
    "3-4 short, warm safety reminders specific to their care"
  ],
  "glossary": [
    { "term": "medical term", "definition": "simple definition" }
  ]
}`;

    let raw = "";
    try {
      raw = await ctx.model.complete(prompt, {
        maxTokens: 2000,
        temperature: 0.4,
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

    if (parsed?.sections?.length) {
      return {
        title: String(parsed.title ?? "Your Personal Care Guide"),
        patientName: patient.firstName,
        generatedAt: new Date().toISOString(),
        sections: parsed.sections.map((s: any) => ({
          heading: String(s.heading ?? ""),
          icon: String(s.icon ?? "leaf"),
          body: String(s.body ?? ""),
          tips: Array.isArray(s.tips) ? s.tips.map(String) : [],
        })),
        safetyReminders: Array.isArray(parsed.safetyReminders)
          ? parsed.safetyReminders.map(String)
          : [],
        glossary: Array.isArray(parsed.glossary)
          ? parsed.glossary.map((g: any) => ({
              term: String(g.term ?? ""),
              definition: String(g.definition ?? ""),
            }))
          : [],
      };
    }

    // Deterministic fallback
    const { simplifyDiagnosis } = await import("@/lib/domain/plain-language");
    const concernTerms = concerns.split(/[,;]+/).map((c: string) => c.trim()).filter(Boolean);
    const simplifiedConcerns = concernTerms.map(simplifyDiagnosis);

    return {
      title: "Your Personal Care Guide",
      patientName: patient.firstName,
      generatedAt: new Date().toISOString(),
      sections: [
        {
          heading: "What We're Working On Together",
          icon: "heart",
          body: simplifiedConcerns.length > 0
            ? `${patient.firstName}, here is what your care team is helping you with:\n\n${simplifiedConcerns.map((c) => `• ${c}`).join("\n")}`
            : `${patient.firstName}, your care team is getting to know you. As we learn more, this section will show what we're working on together.`,
          tips: ["Keep track of how you're feeling each day", "Write down questions before your next visit"],
        },
        {
          heading: "Your Medications",
          icon: "leaf",
          body: patient.dosingRegimens.length > 0
            ? `You are currently taking ${patient.dosingRegimens.length} cannabis medication${patient.dosingRegimens.length > 1 ? "s" : ""}. Each one has been chosen by your care team to help with your specific needs.`
            : "You don't have any medications yet. When your care team prescribes something, it will show up here with clear instructions.",
          tips: ["Take your medicine at the same time each day", "Store cannabis products in a cool, dark place away from children"],
        },
        {
          heading: "What to Watch For",
          icon: "eye",
          body: "As you start or adjust your cannabis medicine, pay attention to how you feel. Most people notice changes in the first week or two. Some common things to notice: changes in sleep, appetite, pain levels, or mood.",
          tips: ["If anything feels wrong or too strong, reach out to us right away through the Messages tab"],
        },
        {
          heading: "Your Goals and Progress",
          icon: "target",
          body: goals !== "Not documented"
            ? `Your goals: ${goals}. Every small step counts. Your care team is here to support you.`
            : "We'll set goals together at your next visit. Think about what matters most to you — better sleep? Less pain? More energy?",
          tips: ["Log your outcomes in the portal so we can see how things are going"],
        },
      ],
      safetyReminders: [
        "Start with a low dose and increase slowly — your care team will guide you",
        "Don't drive or operate heavy machinery until you know how your medicine affects you",
        "Keep all cannabis products locked away from children and pets",
        "Reach out to us anytime through the Messages tab — that's what we're here for",
      ],
      glossary: [],
    };
  },
};
