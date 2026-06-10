import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";

const input = z.object({
  noteId: z.string().optional(),
  encounterId: z.string().optional(),
  patientId: z.string().optional(),
});

const output = z.object({
  tasksCreated: z.number(),
  insights: z.string(),
});

const taskResponseSchema = z.object({
  tasks: z.array(
    z.object({
      title: z.string(),
      description: z.string(),
      priority: z.enum(["high", "medium", "low"]),
      category: z.enum(["follow_up", "lab_order", "medication_review", "referral", "assessment", "education"]),
      dueInDays: z.number(),
    })
  ),
  insights: z.string(),
});

/**
 * Physician Nudge Agent
 * ---------------------
 * After a note is finalized or encounter completed, analyses the patient's
 * situation and creates specific, actionable Task items for the physician.
 * This is the physician's intelligent to-do list.
 */
export const physicianNudgeAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: "physicianNudge",
  version: "1.0.0",
  description: "Analyses finalized notes and completed encounters to create actionable physician tasks.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "read.note", "read.encounter", "write.task"],
  requiresApproval: false,

  async run(params, ctx) {
    // ── Resolve patient, encounter, and note ────────────────────────
    ctx.assertCan("read.encounter");

    let encounterId = params.encounterId;
    let noteId = params.noteId;
    let patientId = params.patientId;

    // If we have a noteId, load it and derive encounterId
    let note: Awaited<ReturnType<typeof prisma.note.findUnique>> | null = null;
    if (noteId) {
      ctx.assertCan("read.note");
      note = await prisma.note.findUnique({ where: { id: noteId } });
      if (note) {
        encounterId = encounterId ?? note.encounterId;
      }
    }

    // Load the encounter (required to resolve patient)
    let encounter: Awaited<ReturnType<typeof prisma.encounter.findUnique>> | null = null;
    if (encounterId) {
      encounter = await prisma.encounter.findUnique({
        where: { id: encounterId },
        include: { patient: true },
      });
      if (encounter) {
        patientId = patientId ?? encounter.patientId;
      }
    }

    if (!patientId) {
      throw new Error("Could not resolve patientId from input, note, or encounter.");
    }

    // ── Load patient and related clinical data ──────────────────────
    ctx.assertCan("read.patient");
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      include: { chartSummary: true },
    });
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    // Load the most recent note if we don't have one yet
    if (!note && encounterId) {
      ctx.assertCan("read.note");
      note = await prisma.note.findFirst({
        where: { encounterId },
        orderBy: { createdAt: "desc" },
      });
    }

    // Load recent outcome logs (last 30 days)
    const recentOutcomes = await prisma.outcomeLog.findMany({
      where: {
        patientId,
        loggedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { loggedAt: "desc" },
      take: 50,
    });

    // Load recent assessment responses
    const recentAssessments = await prisma.assessmentResponse.findMany({
      where: { patientId },
      orderBy: { submittedAt: "desc" },
      take: 10,
      include: { assessment: { select: { slug: true, title: true } } },
    });

    // ── Build the prompt ────────────────────────────────────────────
    const noteBlocks = note?.blocks;
    const noteSummary =
      noteBlocks && Array.isArray(noteBlocks)
        ? (noteBlocks as Array<{ heading?: string; body?: string }>)
            .map((b) => `${b.heading ?? ""}: ${b.body ?? ""}`)
            .join("\n")
        : note?.narrative ?? "No note content available.";

    const outcomeSummary =
      recentOutcomes.length > 0
        ? recentOutcomes
            .slice(0, 20)
            .map((o) => `${o.metric}: ${o.value}/10 (${o.loggedAt.toISOString().slice(0, 10)})`)
            .join(", ")
        : "No recent outcome data.";

    const assessmentSummary =
      recentAssessments.length > 0
        ? recentAssessments
            .map((a) => `${a.assessment.title}: score ${a.score ?? "N/A"} (${a.submittedAt.toISOString().slice(0, 10)})`)
            .join(", ")
        : "No recent assessment data.";

    const cannabisHistory = patient.cannabisHistory
      ? JSON.stringify(patient.cannabisHistory)
      : "No cannabis history on file.";

    const prompt = `You are a clinical care coordinator AI for a cannabis medicine practice. Based on this patient's finalized note and clinical data, identify specific follow-up action items the physician should complete.

Patient: ${patient.firstName} ${patient.lastName}, DOB ${patient.dateOfBirth?.toISOString().slice(0, 10) ?? "unknown"}, presenting concerns: ${patient.presentingConcerns ?? "not specified"}
Note summary: ${noteSummary}
Recent outcomes: ${outcomeSummary}
Assessment scores: ${assessmentSummary}
Cannabis history: ${cannabisHistory}
Treatment goals: ${patient.treatmentGoals ?? "not specified"}

Return ONLY valid JSON:
{
  "tasks": [
    {
      "title": "Short action title",
      "description": "More detail about what to do and why",
      "priority": "high" | "medium" | "low",
      "category": "follow_up" | "lab_order" | "medication_review" | "referral" | "assessment" | "education",
      "dueInDays": 7
    }
  ],
  "insights": "A brief paragraph about anything noteworthy in this patient's trajectory that the physician should be aware of."
}

Generate 2-5 specific, actionable tasks. Examples:
- "Schedule 2-week follow-up for pain reassessment"
- "Review sleep medication interactions before next tincture adjustment"
- "Order CBC panel — no recent labs on file"
- "Consider GAD-7 reassessment — anxiety scores trending up"
- "Discuss treatment goals refinement — patient approaching initial targets"`;

    // ── Call the model and parse ─────────────────────────────────────
    const raw = await ctx.model.complete(prompt, {
      maxTokens: 1024,
      temperature: 0.4,
      redactNames: [patient.firstName, patient.lastName].filter(Boolean),
    });

    let parsed: z.infer<typeof taskResponseSchema>;
    try {
      parsed = taskResponseSchema.parse(JSON.parse(raw));
    } catch {
      ctx.log("warn", "Failed to parse model response, using default tasks", { raw });
      parsed = {
        tasks: [
          {
            title: "Schedule follow-up visit",
            description: "Patient should be seen again to reassess progress and adjust care plan as needed.",
            priority: "medium",
            category: "follow_up",
            dueInDays: 14,
          },
          {
            title: "Review patient outcomes before next visit",
            description: "Check recent outcome logs and assessment scores to prepare for the next encounter.",
            priority: "low",
            category: "assessment",
            dueInDays: 7,
          },
        ],
        insights: "Default tasks generated — model response could not be parsed.",
      };
    }

    // ── Create Task rows ────────────────────────────────────────────
    ctx.assertCan("write.task");
    const now = new Date();
    const createdTasks = await Promise.all(
      parsed.tasks.map((t) =>
        prisma.task.create({
          data: {
            organizationId: patient.organizationId,
            patientId,
            title: t.title,
            description: t.description,
            kind: "clinical_review",
            assigneeRole: "clinician",
            dueAt: new Date(now.getTime() + t.dueInDays * 24 * 60 * 60 * 1000),
            status: "open",
          },
        })
      )
    );

    // ── Audit + log ─────────────────────────────────────────────────
    for (const task of createdTasks) {
      await writeAgentAudit(
        "physicianNudge",
        "1.0.0",
        patient.organizationId,
        "task.created",
        { type: "Task", id: task.id },
        { patientId, noteId, encounterId }
      );
    }

    ctx.log("info", "Physician nudge tasks created", {
      tasksCreated: createdTasks.length,
      taskIds: createdTasks.map((t) => t.id),
    });

    return {
      tasksCreated: createdTasks.length,
      insights: parsed.insights,
    };
  },
};
