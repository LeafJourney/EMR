import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { resolveModelClient } from "@/lib/orchestration/model-client";
import { withPhiRedaction } from "@/lib/orchestration/redacting-model-client";

// ---------------------------------------------------------------------------
// Lab Summarizer Agent — MALLIK-006
// ---------------------------------------------------------------------------
// Given a LabResult id, produces three drafts the clinician can review before
// sending anything out:
//   - patientDraft — patient-friendly summary of the result
//   - maDraft      — one-liner for the MA to follow up (call / email)
//   - physicianNote — one-line entry for the physician's chart
//
// The function that does the actual work is exposed as `summarizeLabResult`
// so synchronous server actions (the "Looks good" button) can call it
// directly without spinning up a full AgentJob. The Agent wrapper exists so
// the orchestration fleet can run it asynchronously too (workflow triggers,
// batch retries, etc.) and so it shows up in the agent registry alongside
// the rest of the clinical fleet.
// ---------------------------------------------------------------------------

const input = z.object({ labResultId: z.string() });

const output = z.object({
  patientDraft: z.string(),
  maDraft: z.string(),
  physicianNote: z.string(),
  outreachId: z.string(),
});

const AGENT_NAME = "labSummarizer";
const AGENT_VERSION = "1.0.0";

const SYSTEM_PROMPT = `You are a physician's drafting assistant for a cannabis care EMR.
You are given a patient's current lab results compared against their prior values.
You return THREE short drafts for the clinician to review before anything is sent.

Rules:
- Warm, plain-language tone for the patient message (6th-grade reading level). No jargon.
- MA task must be one sentence — "Call/message <first name> about <result> and confirm <next step>."
- Physician chart note must be one sentence — clinical voice, for the record.
- Never invent values. Only reference values present in the input.
- If a marker moved, say so plainly ("Your LDL is 108. Last time it was 132.").
- End the patient message with "Call or message us with any questions."

Return your response as JSON in this exact shape:
{
  "patientDraft": "<3–5 sentence patient-friendly message>",
  "maDraft": "<one sentence MA action>",
  "physicianNote": "<one sentence chart note>"
}`;

interface MarkerValue {
  value: number;
  unit: string;
  refLow?: number;
  refHigh?: number;
  abnormal: boolean;
}

function formatMarkers(markers: Record<string, MarkerValue>): string {
  const lines: string[] = [];
  for (const [name, m] of Object.entries(markers)) {
    const range =
      m.refLow !== undefined && m.refHigh !== undefined
        ? ` (normal ${m.refLow}-${m.refHigh} ${m.unit})`
        : m.refLow !== undefined
          ? ` (normal ≥${m.refLow} ${m.unit})`
          : m.refHigh !== undefined
            ? ` (normal ≤${m.refHigh} ${m.unit})`
            : "";
    const flag = m.abnormal ? " [ABNORMAL]" : "";
    lines.push(`  ${name}: ${m.value} ${m.unit}${range}${flag}`);
  }
  return lines.join("\n");
}

/**
 * Core drafting logic. Callable directly from a server action when a
 * clinician clicks "Looks good". Creates a LabOutreach row linked to the
 * LabResult and returns the three drafts for preview.
 */
export async function summarizeLabResult(
  labResultId: string
): Promise<z.infer<typeof output>> {
  const lab = await prisma.labResult.findUnique({
    where: { id: labResultId },
    include: {
      patient: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          medications: { where: { active: true } },
        },
      },
    },
  });
  if (!lab) throw new Error(`LabResult not found: ${labResultId}`);

  // Prior result — same patient, same panel, signed earlier than this one.
  const prior = await prisma.labResult.findFirst({
    where: {
      patientId: lab.patientId,
      panelName: lab.panelName,
      id: { not: lab.id },
      receivedAt: { lt: lab.receivedAt },
    },
    orderBy: { receivedAt: "desc" },
  });

  const currentMarkers = lab.results as unknown as Record<string, MarkerValue>;
  const priorMarkers = (prior?.results ?? {}) as unknown as Record<string, MarkerValue>;

  const medList = lab.patient.medications.map((m) => m.name).join(", ") || "none on file";

  const prompt =
    SYSTEM_PROMPT +
    `\n\nPATIENT: ${lab.patient.firstName} ${lab.patient.lastName}` +
    `\nACTIVE MEDICATIONS: ${medList}` +
    `\nPANEL: ${lab.panelName}` +
    `\nCURRENT RESULTS (received ${lab.receivedAt.toISOString().slice(0, 10)}):\n${formatMarkers(currentMarkers)}` +
    (prior
      ? `\nPRIOR RESULTS (received ${prior.receivedAt.toISOString().slice(0, 10)}):\n${formatMarkers(priorMarkers)}`
      : `\nPRIOR RESULTS: none on file (first time this panel has been drawn)`);

  // Route through the PHI-redaction chokepoint — this agent calls
  // resolveModelClient() directly (not via ctx.model), so without this wrapper
  // the full patient name + meds + lab markers would egress to OpenRouter
  // unredacted.
  const model = withPhiRedaction(resolveModelClient(), "lab-summarizer");
  const raw = await model.complete(prompt, {
    maxTokens: 800,
    temperature: 0.3,
    redactNames: [lab.patient.firstName, lab.patient.lastName].filter(Boolean),
  });

  // Tolerant JSON extraction — models sometimes wrap in ```json fences or
  // add preambles. Pull the first {...} block we can parse.
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  let parsed: { patientDraft?: string; maDraft?: string; physicianNote?: string };
  if (jsonMatch) {
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      parsed = {};
    }
  } else {
    parsed = {};
  }

  const patientDraft =
    parsed.patientDraft?.trim() ||
    `Hi ${lab.patient.firstName}, your ${lab.panelName} results are in and your provider has reviewed them. Call or message us with any questions.`;
  const maDraft =
    parsed.maDraft?.trim() ||
    `Message ${lab.patient.firstName} ${lab.patient.lastName} about their ${lab.panelName} results and confirm next steps.`;
  const physicianNote =
    parsed.physicianNote?.trim() ||
    `${lab.panelName} reviewed${prior ? " with prior comparison" : ""}; drafts generated for outreach.`;

  // Upsert so repeated "Looks good" clicks don't pile up duplicate outreach rows.
  const outreach = await prisma.labOutreach.upsert({
    where: { labResultId: lab.id },
    create: {
      labResultId: lab.id,
      patientDraft,
      maDraft,
      physicianNote,
      routing: { patientMessage: true, maTask: true, sms: false, voice: false, pdf: false, fax: false },
      status: "draft",
    },
    update: {
      patientDraft,
      maDraft,
      physicianNote,
    },
  });

  await writeAgentAudit(
    AGENT_NAME,
    AGENT_VERSION,
    lab.organizationId,
    "labOutreach.drafted",
    { type: "LabResult", id: lab.id },
    { outreachId: outreach.id, hadPrior: !!prior }
  );

  return {
    patientDraft,
    maDraft,
    physicianNote,
    outreachId: outreach.id,
  };
}

export const labSummarizerAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: AGENT_NAME,
  version: AGENT_VERSION,
  description:
    "Given a lab result, drafts patient-facing, MA-facing, and chart-facing " +
    "outreach text using the current + prior comparison. Never sends — the " +
    "clinician reviews and approves the drafts before anything leaves.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient"],
  requiresApproval: true,

  async run({ labResultId }, ctx) {
    ctx.assertCan("read.patient");
    return summarizeLabResult(labResultId);
  },
};
