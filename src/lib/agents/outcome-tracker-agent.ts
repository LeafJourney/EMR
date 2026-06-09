import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";

const input = z.object({
  patientId: z.string(),
  lastCheckInAt: z.union([z.string(), z.date()]).optional(),
});

const output = z.object({
  scheduled: z.array(
    z.object({
      kind: z.string(),
      dueAt: z.string(),
    })
  ),
});

/**
 * Outcome Tracker Agent
 * ---------------------
 * Watches follow-up cadence per patient and creates Tasks to prompt
 * symptom/efficacy check-ins at the right intervals.
 */
export const outcomeTrackerAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: "outcomeTracker",
  version: "1.0.0",
  description: "Schedules outcome and symptom check-in prompts.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "write.task", "write.outcome.reminder"],
  requiresApproval: false,

  async run({ patientId }, ctx) {
    ctx.assertCan("read.patient");
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    const now = new Date();
    const dueAt3d = new Date(now.getTime() + 3 * 86400000);
    const dueAt7d = new Date(now.getTime() + 7 * 86400000);

    ctx.assertCan("write.task");
    const tasks = [
      {
        title: "Log how you've been feeling (3 days)",
        dueAt: dueAt3d,
        kind: "outcome.checkin.3d",
      },
      {
        title: "Weekly symptom check-in",
        dueAt: dueAt7d,
        kind: "outcome.checkin.7d",
      },
    ];

    for (const t of tasks) {
      await prisma.task.create({
        data: {
          organizationId: patient.organizationId,
          patientId,
          title: t.title,
          kind: "patient_task",
          assigneeRole: "patient",
          dueAt: t.dueAt,
        },
      });
    }

    await writeAgentAudit(
      "outcomeTracker",
      "1.0.0",
      patient.organizationId,
      "outcome.reminders.scheduled",
      { type: "Patient", id: patientId },
      { count: tasks.length }
    );

    ctx.log("info", "Outcome reminders scheduled", { count: tasks.length });

    return {
      scheduled: tasks.map((t) => ({ kind: t.kind, dueAt: t.dueAt.toISOString() })),
    };
  },
};
