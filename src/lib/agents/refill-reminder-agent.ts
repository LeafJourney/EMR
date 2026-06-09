import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";

// ---------------------------------------------------------------------------
// Refill Reminder Agent
// ---------------------------------------------------------------------------
// Walks a patient's active dosing regimens and estimates how many days of
// supply remain based on dose volume, frequency, and logged doses. If supply
// would run out in fewer than 5 days, creates a patient-facing Task prompting
// a refill. Deterministic — no LLM needed.
// ---------------------------------------------------------------------------

const input = z.object({ patientId: z.string() });

const output = z.array(
  z.object({
    regimenId: z.string(),
    daysRemaining: z.number(),
    reminderSent: z.boolean(),
  })
);

const LOW_SUPPLY_THRESHOLD_DAYS = 5;
// Default assumed package size when the product has no volume data. This is a
// reasonable floor so we always return *something* meaningful in demo data.
const DEFAULT_PACKAGE_VOLUME = 30;

export const refillReminderAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "refillReminder",
  version: "1.0.0",
  description:
    "Projects when each active dosing regimen will run out and creates a " +
    "task reminder if supply is under 5 days.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "write.task"],
  requiresApproval: false,

  async run({ patientId }, ctx) {
    ctx.assertCan("read.patient");
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    const regimens = await prisma.dosingRegimen.findMany({
      where: { patientId, active: true },
      include: { product: true },
    });

    const results: z.infer<typeof output> = [];

    for (const regimen of regimens) {
      const dailyUsage =
        (regimen.volumePerDose ?? 0) * (regimen.frequencyPerDay ?? 1);

      // Use the product's package/bottle size if present on metadata, else default.
      const packageVolume =
        (regimen.product as any)?.packageVolume ??
        (regimen.product as any)?.bottleVolume ??
        DEFAULT_PACKAGE_VOLUME;

      // How many days since regimen start (cap at package lifetime)
      const daysSinceStart = Math.max(
        0,
        Math.floor(
          (Date.now() - new Date(regimen.startDate).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );

      const consumed = dailyUsage * daysSinceStart;
      const remaining = Math.max(0, packageVolume - consumed);
      const daysRemaining =
        dailyUsage > 0 ? Math.floor(remaining / dailyUsage) : 99;

      let reminderSent = false;
      if (daysRemaining < LOW_SUPPLY_THRESHOLD_DAYS) {
        // De-duplicate — don't spam a new task if one exists in the past 3 days
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const existing = await prisma.task.findFirst({
          where: {
            patientId,
            createdAt: { gte: threeDaysAgo },
            title: { contains: "Refill reminder" },
            description: { contains: regimen.id },
          },
        });

        if (!existing) {
          ctx.assertCan("write.task");
          await prisma.task.create({
            data: {
              organizationId: patient.organizationId,
              patientId,
              title: `Refill reminder: ${regimen.product?.name ?? "your cannabis medicine"}`,
              description: `You have approximately ${daysRemaining} day${daysRemaining === 1 ? "" : "s"} of ${regimen.product?.name ?? "your medicine"} left. Tap to request a refill so you don't run out.\n\n[regimenId: ${regimen.id}]`,
              status: "open",
              kind: "refill",
              assigneeRole: "patient",
              dueAt: new Date(
                Date.now() +
                  Math.max(1, daysRemaining - 1) * 24 * 60 * 60 * 1000
              ),
            },
          });
          reminderSent = true;
        }
      }

      results.push({
        regimenId: regimen.id,
        daysRemaining,
        reminderSent,
      });
    }

    await writeAgentAudit(
      "refillReminder",
      "1.0.0",
      patient.organizationId,
      "refill.check",
      { type: "Patient", id: patientId },
      {
        regimens: regimens.length,
        remindersCreated: results.filter((r) => r.reminderSent).length,
      }
    );

    ctx.log("info", "Refill check complete", {
      regimens: regimens.length,
      remindersCreated: results.filter((r) => r.reminderSent).length,
    });

    return results;
  },
};
