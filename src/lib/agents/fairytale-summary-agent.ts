import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";

// ---------------------------------------------------------------------------
// Fairytale Chart Summary Agent (EMR-069)
// ---------------------------------------------------------------------------
// Generates a warm, storybook-style one-page chart summary that reads
// like a fairytale. Used by both providers (for quick chart review) and
// patients (to understand their own journey in plain language).
// ---------------------------------------------------------------------------

function ageFromDob(dob: Date): number {
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const md = now.getMonth() - dob.getMonth();
  if (md < 0 || (md === 0 && now.getDate() < dob.getDate())) age--;
  return age;
}

const input = z.object({ patientId: z.string() });

const output = z.object({
  title: z.string(),
  openingLine: z.string(),
  chapters: z.array(
    z.object({
      heading: z.string(),
      body: z.string(),
    }),
  ),
  closingLine: z.string(),
  generatedAt: z.string(),
});

export const fairytaleSummaryAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "fairytaleSummary",
  version: "1.0.0",
  description:
    "Generates a one-page AI chart summary in the voice of a warm, " +
    "literary storybook — readable by both clinicians and patients.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "read.encounter", "read.note"],
  requiresApproval: false,

  async run({ patientId }, ctx) {
    ctx.log("info", "Generating fairytale chart summary", { patientId });

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: {
        chartSummary: true,
        medications: { where: { active: true } },
        encounters: {
          orderBy: { createdAt: "desc" },
          take: 3,
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

    const age = patient.dateOfBirth ? ageFromDob(patient.dateOfBirth) : null;
    const meds = patient.medications.map((m: any) => m.name).join(", ") || "no medications";

    const latestNoteSummary = (() => {
      const note = patient.encounters[0]?.notes[0];
      if (!note) return null;
      const blocks = note.blocks as Array<{ type: string; body: string }>;
      const summary =
        blocks.find((b) => b.type === "summary") ??
        blocks.find((b) => b.type === "assessment");
      return summary?.body ?? null;
    })();

    const prompt = `You are a warm, literary storyteller writing a one-page chart summary in the voice of a beloved storybook.

Write about this patient as if they are the quiet hero of their own gentle fairytale. The summary should be readable by BOTH clinicians (so it must contain accurate clinical information) AND by the patient themselves (so the language should be warm, plain, and human — no jargon).

PATIENT: ${patient.firstName} ${patient.lastName}${age ? `, ${age} years old` : ""}
CONCERNS: ${patient.presentingConcerns ?? "Not documented"}
GOALS: ${patient.treatmentGoals ?? "Not documented"}
MEDICATIONS: ${meds}
CHART SUMMARY: ${patient.chartSummary?.summaryMd ?? "New to care"}
LAST VISIT NOTE: ${latestNoteSummary ?? "No prior visits"}

Return ONLY valid JSON:
{
  "title": "A gentle, story-like title for ${patient.firstName}'s chapter (3-6 words)",
  "openingLine": "Once upon a time... style opening sentence introducing the patient",
  "chapters": [
    {
      "heading": "The Story So Far",
      "body": "2-3 sentences narrating what brought them to care, warmly"
    },
    {
      "heading": "Where They Stand Today",
      "body": "2-3 sentences on their current state — medications, concerns, progress"
    },
    {
      "heading": "The Path Ahead",
      "body": "2-3 sentences on their treatment goals and next steps, hopeful in tone"
    }
  ],
  "closingLine": "One warm, encouraging sentence to close the story",
  "generatedAt": "${new Date().toISOString()}"
}

Keep every chapter under 60 words. The tone should feel like a children's book for adults — warm, dignified, and real.`;

    let raw = "";
    try {
      raw = await ctx.model.complete(prompt, {
        maxTokens: 800,
        temperature: 0.55,
        redactNames: [patient.firstName, patient.lastName].filter(Boolean),
      });
    } catch (err) {
      ctx.log("warn", "LLM call failed — using fallback narrative", {
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Try to parse JSON from the response
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

    if (parsed?.chapters?.length) {
      return {
        title: parsed.title ?? `${patient.firstName}'s Story`,
        openingLine:
          parsed.openingLine ??
          `Once upon a time, in a place of quiet care, there lived a person named ${patient.firstName}.`,
        chapters: parsed.chapters.map((c: any) => ({
          heading: String(c.heading ?? "A Chapter"),
          body: String(c.body ?? ""),
        })),
        closingLine:
          parsed.closingLine ??
          `And the story of ${patient.firstName} continues, one gentle day at a time.`,
        generatedAt: new Date().toISOString(),
      };
    }

    // Deterministic fallback
    return {
      title: `${patient.firstName}'s Story`,
      openingLine: `Once upon a time, in a quiet corner of the world, there lived a person named ${patient.firstName}${age ? `, who had seen ${age} years of seasons come and go` : ""}.`,
      chapters: [
        {
          heading: "The Story So Far",
          body: patient.presentingConcerns
            ? `${patient.firstName} came to us with a story of ${patient.presentingConcerns.toLowerCase()}. It was not the story they had planned for themselves, but it was the one they were living — and they came looking for help to write a better chapter.`
            : `${patient.firstName} joined our care with hope and questions, the way so many good stories begin.`,
        },
        {
          heading: "Where They Stand Today",
          body: latestNoteSummary
            ? `Today, ${patient.firstName} is working with their care team. ${latestNoteSummary.slice(0, 180)}`
            : `Today, ${patient.firstName} is building a relationship with a team of people who see them fully — not as a patient, but as a person.`,
        },
        {
          heading: "The Path Ahead",
          body: patient.treatmentGoals
            ? `The road ahead is guided by ${patient.firstName}'s own words: ${patient.treatmentGoals.toLowerCase()}. Each visit, each check-in, each small choice is a step along that road.`
            : `The road ahead is being shaped one visit at a time — with trust, with care, and with the steady rhythm of a story still being written.`,
        },
      ],
      closingLine: `And so ${patient.firstName}'s story continues, one gentle day at a time.`,
      generatedAt: new Date().toISOString(),
    };
  },
};
