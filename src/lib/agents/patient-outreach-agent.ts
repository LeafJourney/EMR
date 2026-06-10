import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { appendConsentDisclaimer } from "@/lib/clinical/ai-consent-disclaimer";

const input = z.object({
  patientId: z.string(),
  encounterId: z.string(),
});

const output = z.object({
  draftMessageId: z.string().nullable(),
  subject: z.string(),
  tone: z.string(),
  skipped: z.boolean().optional(),
});

const messageResponseSchema = z.object({
  subject: z.string(),
  body: z.string(),
  tone: z.enum(["warm", "encouraging", "concerned"]),
});

/**
 * Patient Outreach Agent
 * ----------------------
 * After an encounter is completed, drafts a personalized follow-up message
 * to the patient. The message is warm, specific to what was discussed, and
 * includes actionable next steps. Always approval-gated — a human must
 * click Send.
 */
export const patientOutreachAgent: Agent<z.infer<typeof input>, z.infer<typeof output>> = {
  name: "patientOutreach",
  version: "1.0.0",
  description: "Drafts a personalized post-visit follow-up message to the patient for human approval.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "read.encounter", "read.note", "write.message.draft"],
  requiresApproval: true,

  async run({ patientId, encounterId }, ctx) {
    // ── Load patient and encounter ──────────────────────────────────
    ctx.assertCan("read.patient");
    const patient = await prisma.patient.findUnique({ where: { id: patientId } });
    if (!patient) throw new Error(`Patient not found: ${patientId}`);

    ctx.assertCan("read.encounter");
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
    });
    if (!encounter) throw new Error(`Encounter not found: ${encounterId}`);

    // EMR-1101 (M6) dedup rule: the physician-reviewed visit-completion
    // release is the AUTHORITATIVE post-visit patient message. Releasing
    // visit completion creates a reviewed patient draft in the same
    // transaction as the VisitCompletion record, so if a release exists for
    // any note on this encounter, this agent skips — otherwise the patient
    // thread / approvals queue ends up with two near-identical drafts.
    // (releaseVisitCompletion applies the mirror-image check for the
    // opposite ordering, where this agent drafted first.)
    const existingRelease = await prisma.visitCompletion.findFirst({
      where: { note: { encounterId } },
      select: { id: true },
    });
    if (existingRelease) {
      ctx.log("info", "Visit-completion release already drafted a patient message — skipping outreach draft", {
        encounterId,
        visitCompletionId: existingRelease.id,
      });
      return { draftMessageId: null, subject: "", tone: "warm", skipped: true };
    }

    // Load the latest note for this encounter (if finalized)
    ctx.assertCan("read.note");
    const note = await prisma.note.findFirst({
      where: { encounterId, status: "finalized" },
      orderBy: { finalizedAt: "desc" },
    });

    // Load recent outcome trends
    const recentOutcomes = await prisma.outcomeLog.findMany({
      where: {
        patientId,
        loggedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { loggedAt: "desc" },
      take: 20,
    });

    // ── Build the prompt ────────────────────────────────────────────
    const noteBlocks = note?.blocks;
    const noteSummary =
      noteBlocks && Array.isArray(noteBlocks)
        ? (noteBlocks as Array<{ heading?: string; body?: string }>)
            .map((b) => `${b.heading ?? ""}: ${b.body ?? ""}`)
            .join("\n")
        : note?.narrative ?? "Note not yet available.";

    const cannabisHistory = patient.cannabisHistory
      ? JSON.stringify(patient.cannabisHistory)
      : "No cannabis history on file.";

    const prompt = `You are a compassionate care team member at a cannabis medicine practice. Draft a warm, personalized follow-up message to this patient after their visit.

Patient first name: ${patient.firstName}
Visit type: ${encounter.modality}
Visit reason: ${encounter.reason ?? "general follow-up"}
Note summary: ${noteSummary}
Treatment goals: ${patient.treatmentGoals ?? "not specified"}
Cannabis history: ${cannabisHistory}

Return ONLY valid JSON:
{
  "subject": "Brief message subject line",
  "body": "The full message body. Use warm, first-person plural ('we') language. Reference specific details from the visit. Include 2-3 concrete next steps. Keep it under 200 words. Do not use clinical jargon.",
  "tone": "warm" | "encouraging" | "concerned"
}

Guidelines:
- Address the patient by first name
- Reference something specific from the visit (not generic boilerplate)
- Include clear next steps (e.g., "log your sleep daily", "try the tincture at bedtime", "reach out if pain worsens")
- End with reassurance and availability
- Sign off as "Your care team at Leafjourney"`;

    // ── Call the model and parse ─────────────────────────────────────
    const raw = await ctx.model.complete(prompt, { maxTokens: 512, temperature: 0.6 });

    let parsed: z.infer<typeof messageResponseSchema>;
    try {
      parsed = messageResponseSchema.parse(JSON.parse(raw));
    } catch {
      ctx.log("warn", "Failed to parse model response, using default template", { raw });
      const reason = encounter.reason ?? patient.treatmentGoals ?? "your care";
      parsed = {
        subject: "Following up after your visit",
        body: `Hi ${patient.firstName}, thank you for your visit today. We discussed your ${reason} and I'm glad we could make some progress. Remember to keep tracking your symptoms and reach out if anything comes up between now and your next visit. Don't hesitate to message us with any questions.\n\n— Your care team at Leafjourney`,
        tone: "warm",
      };
    }

    // ── Find or create message thread ───────────────────────────────
    const existingThread = await prisma.messageThread.findFirst({
      where: { patientId },
      orderBy: { lastMessageAt: "desc" },
    });

    const threadId =
      existingThread?.id ??
      (
        await prisma.messageThread.create({
          data: {
            patientId,
            subject: parsed.subject,
          },
        })
      ).id;

    // ── Create the draft message (NOT sent) ─────────────────────────
    ctx.assertCan("write.message.draft");

    // EMR-784: AI-drafted post-visit message — append the patient
    // verbal-consent disclaimer so the patient sees that AI was used to
    // document the encounter that produced this outreach.
    const bodyWithConsent = appendConsentDisclaimer(parsed.body);

    const message = await prisma.message.create({
      data: {
        threadId,
        body: bodyWithConsent,
        senderAgent: "agent:patientOutreach@1.0.0",
        aiDrafted: true,
        status: "draft",
      },
    });

    // ── Audit + log ─────────────────────────────────────────────────
    await writeAgentAudit(
      "patientOutreach",
      "1.0.0",
      patient.organizationId,
      "message.drafted",
      { type: "Message", id: message.id },
      { patientId, encounterId, threadId, tone: parsed.tone }
    );

    ctx.log("info", "Patient outreach draft created", {
      messageId: message.id,
      threadId,
      subject: parsed.subject,
      tone: parsed.tone,
    });

    return {
      draftMessageId: message.id,
      subject: parsed.subject,
      tone: parsed.tone,
    };
  },
};
