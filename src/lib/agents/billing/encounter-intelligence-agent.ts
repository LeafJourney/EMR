import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { startReasoning } from "../memory/agent-reasoning";
import { recallMemories, formatMemoriesForPrompt } from "../memory/patient-memory";

// ---------------------------------------------------------------------------
// Encounter Intelligence Agent
// ---------------------------------------------------------------------------
// First agent in the clean claim path. Wakes up when the physician approves
// the coding suggestions on a finalized note (EMR-1097 — previously this ran
// on encounter.completed, creating charges before the physician ever reviewed
// the codes), reads the clinical documentation, and extracts billable charges.
//
// This agent answers: "What services were performed in this visit?"
//
// It does NOT assign final codes (that's the Coding Optimization Agent).
// It identifies the billable INTENT from the documentation and creates
// Charge objects with tentative CPT codes and linked diagnoses, reconciled
// against the physician-approved ICD-10 set and E/M level when provided.
//
// Layer 3 state transition: (none) → charge.created
// Layer 4 events: subscribes coding.approved, emits charge.created
// ---------------------------------------------------------------------------

function tryParseJSON(text: string): any | null {
  const jsonMatch =
    text.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    text.match(/(\{[\s\S]*\})/) ||
    text.match(/(\[[\s\S]*\])/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[1] || jsonMatch[0]);
  } catch {
    return null;
  }
}

const input = z.object({
  encounterId: z.string(),
  patientId: z.string(),
  // EMR-1097 — physician-approved codes from the coding.approved event.
  // When present, they are authoritative and the extraction reconciles
  // against them.
  noteId: z.string().optional(),
  approvedIcd10: z.array(z.string()).optional(),
  approvedEmLevel: z.string().nullable().optional(),
});

const chargeOutput = z.object({
  cptCode: z.string(),
  cptDescription: z.string(),
  modifiers: z.array(z.string()).optional(),
  units: z.number().int().min(1),
  icd10Codes: z.array(z.string()),
  confidence: z.number(),
});

const output = z.object({
  encounterId: z.string(),
  charges: z.array(chargeOutput),
  usedLLM: z.boolean(),
});

export const encounterIntelligenceAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "encounterIntelligence",
  version: "1.0.0",
  description:
    "Extracts billable intent from completed encounters. Creates Charge " +
    "objects from clinical documentation. First agent in the clean claim path.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: [
    "read.patient",
    "read.encounter",
    "read.note",
    "write.claim.scrub", // reusing for charge creation permission
  ],
  requiresApproval: false,

  async run({ encounterId, patientId, approvedIcd10, approvedEmLevel }, ctx) {
    const trace = startReasoning("encounterIntelligence", "1.0.0", ctx.jobId);
    trace.step("begin charge extraction", {
      encounterId,
      approvedIcd10Count: approvedIcd10?.length ?? 0,
      approvedEmLevel: approvedEmLevel ?? null,
    });

    ctx.assertCan("read.encounter");

    // ── Load encounter + notes + patient context ────────────────
    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        notes: {
          where: { status: { in: ["finalized", "pending_cosign"] } },
          orderBy: { createdAt: "desc" },
        },
        patient: {
          include: {
            medications: { where: { active: true } },
            dosingRegimens: {
              where: { active: true },
              include: { product: true },
            },
          },
        },
        provider: true,
      },
    });

    if (!encounter) throw new Error(`Encounter ${encounterId} not found`);
    const patient = encounter.patient;
    trace.step("loaded encounter", {
      noteCount: encounter.notes.length,
      modality: encounter.modality,
      providerId: encounter.providerId,
    });

    // Check if charges already exist for this encounter (idempotency)
    const existingCharges = await prisma.charge.count({
      where: { encounterId, status: "pending" },
    });
    if (existingCharges > 0) {
      ctx.log("info", "Charges already exist for this encounter — skipping");
      trace.step("idempotency check — charges already exist", { existingCharges });
      trace.conclude({ confidence: 1.0, summary: "Skipped — charges already extracted." });
      await trace.persist();
      return { encounterId, charges: [], usedLLM: false };
    }

    // ── Build documentation block ───────────────────────────────
    const noteBlocks = encounter.notes
      .flatMap((n: any) => {
        const blocks = Array.isArray(n.blocks) ? n.blocks : [];
        return blocks.map((b: any) => `### ${b.heading}\n${b.body}`);
      })
      .join("\n\n");

    if (!noteBlocks.trim()) {
      ctx.log("warn", "No finalized notes found — cannot extract charges");
      trace.conclude({ confidence: 0, summary: "No documentation to extract charges from." });
      await trace.persist();
      return { encounterId, charges: [], usedLLM: false };
    }

    // Recall patient memories for context
    const memories = await recallMemories(patientId, {
      kinds: ["working", "not_working", "context"],
      limit: 10,
    });
    trace.step("recalled memories", { count: memories.length });

    // ── Fee schedule lookup ─────────────────────────────────────
    const feeSchedule = await prisma.feeScheduleEntry.findMany({
      where: { organizationId: encounter.organizationId, active: true },
    });
    const feeMap = new Map(feeSchedule.map((f: any) => [f.cptCode, f.rateCents]));
    trace.step("loaded fee schedule", { entries: feeSchedule.length });

    // ── LLM extraction ──────────────────────────────────────────
    const prompt = `You are a medical billing charge extraction specialist for a cannabis care practice.

Given the clinical documentation below, identify every billable service performed during this encounter.

ENCOUNTER:
- Modality: ${encounter.modality}
- Place of service: ${encounter.placeOfService ?? "11"}
- Provider: ${encounter.provider?.title ?? "Provider"}

CLINICAL DOCUMENTATION:
${noteBlocks}

PATIENT CONTEXT:
${formatMemoriesForPrompt(memories)}

ACTIVE CANNABIS REGIMENS:
${patient.dosingRegimens.map((r: any) => `  - ${r.product?.name ?? "cannabis product"}: ${r.volumePerDose}${r.volumeUnit} ${r.frequencyPerDay}x/day`).join("\n") || "  (none)"}

PHYSICIAN-APPROVED CODING (authoritative — use these for the E/M level and diagnoses):
${approvedEmLevel ? `- Approved E/M level: ${approvedEmLevel}` : "- No approved E/M level on file"}
${approvedIcd10 && approvedIcd10.length > 0 ? `- Approved ICD-10 codes: ${approvedIcd10.join(", ")}` : "- No approved ICD-10 codes on file"}

For each billable service, return a JSON array:
[
  {
    "cptCode": "99214",
    "cptDescription": "Office visit, established patient, moderate MDM",
    "modifiers": [],
    "units": 1,
    "icd10Codes": ["F17.210", "G89.29"],
    "confidence": 0.9
  }
]

Rules:
- Always include an E/M code if a provider-patient encounter occurred
- Include procedure codes for any procedures performed (injections, lab draws, wound care, etc.)
- If an E/M and a procedure are billed same-day by the same provider, flag that modifier 25 may be needed on the E/M
- Cannabis counseling may be coded as Z71.3 (dietary counseling) or 99407 (tobacco cessation counseling analog)
- Use ICD-10 codes at the highest specificity the documentation supports
- Confidence should reflect how clearly the documentation supports the charge

Return ONLY the JSON array. No markdown, no explanation.`;

    let charges: z.infer<typeof chargeOutput>[] = [];
    let usedLLM = false;

    try {
      const raw = await ctx.model.complete(prompt, {
        maxTokens: 512,
        temperature: 0.2,
      });
      usedLLM = raw.length > 20 && !raw.startsWith("[stub");
      trace.step("llm extraction complete", { rawLen: raw.length, usedLLM });

      if (usedLLM) {
        const parsed = tryParseJSON(raw);
        if (Array.isArray(parsed)) {
          charges = parsed
            .map((c: any) => chargeOutput.safeParse(c))
            .filter((r: any) => r.success)
            .map((r: any) => r.data);
          trace.step("parsed charges", { count: charges.length });
        }
      }
    } catch (err) {
      ctx.log("warn", "LLM charge extraction failed — using deterministic fallback", {
        error: err instanceof Error ? err.message : String(err),
      });
      trace.step("llm failed — using fallback");
    }

    // ── Deterministic fallback ──────────────────────────────────
    if (charges.length === 0) {
      // At minimum, every completed encounter with documentation gets an E/M
      // charge — the physician-approved level when we have one.
      charges = [
        {
          cptCode: approvedEmLevel ?? "99213",
          cptDescription: approvedEmLevel
            ? "Office visit, established patient (physician-approved E/M)"
            : "Office visit, established patient, low MDM",
          modifiers: [],
          units: 1,
          icd10Codes:
            approvedIcd10 && approvedIcd10.length > 0
              ? approvedIcd10
              : ["Z71.3"], // cannabis counseling as default
          confidence: approvedEmLevel ? 0.9 : 0.6,
        },
      ];
      trace.step("used deterministic fallback", {
        cptCode: approvedEmLevel ?? "99213",
      });
    }

    // ── Reconcile with the physician-approved coding ────────────
    // EMR-1097: the physician's approval (coding.approved) is the source of
    // truth for the E/M level and diagnosis set. The LLM extraction supplies
    // procedure detail; the approved codes override what it guessed.
    if (approvedEmLevel || (approvedIcd10 && approvedIcd10.length > 0)) {
      charges = charges.map((charge) => {
        const isEmCode = /^99\d{3}$/.test(charge.cptCode);
        return {
          ...charge,
          cptCode: isEmCode && approvedEmLevel ? approvedEmLevel : charge.cptCode,
          icd10Codes:
            approvedIcd10 && approvedIcd10.length > 0
              ? approvedIcd10
              : charge.icd10Codes,
          // Physician review raises our confidence floor.
          confidence: Math.max(charge.confidence, 0.9),
        };
      });
      trace.step("reconciled charges with physician-approved coding", {
        approvedEmLevel: approvedEmLevel ?? null,
        approvedIcd10Count: approvedIcd10?.length ?? 0,
      });
    }

    // ── Persist charges ─────────────────────────────────────────
    ctx.assertCan("write.claim.scrub");

    const createdCharges = [];
    for (const charge of charges) {
      const feeAmountCents = feeMap.get(charge.cptCode) ?? 15000; // default $150 if not in schedule
      const created = await prisma.charge.create({
        data: {
          encounterId,
          patientId,
          organizationId: encounter.organizationId,
          cptCode: charge.cptCode,
          cptDescription: charge.cptDescription,
          modifiers: charge.modifiers ?? [],
          units: charge.units,
          icd10Codes: charge.icd10Codes,
          feeAmountCents,
          confidence: charge.confidence,
          createdBy: "encounterIntelligence:1.0.0",
        },
      });
      createdCharges.push(created);

      // Emit charge.created for each charge → Coding Optimization picks up
      await ctx.emit({
        name: "charge.created",
        chargeId: created.id,
        encounterId,
        patientId,
        organizationId: encounter.organizationId,
      });
    }

    await writeAgentAudit(
      "encounterIntelligence",
      "1.0.0",
      encounter.organizationId,
      "charges.extracted",
      { type: "Encounter", id: encounterId },
      { chargeCount: createdCharges.length, usedLLM },
    );

    trace.conclude({
      confidence: usedLLM
        ? Math.min(...charges.map((c) => c.confidence))
        : 0.6,
      summary: `Extracted ${createdCharges.length} charge(s) from encounter documentation. ${usedLLM ? "LLM-assisted." : "Deterministic fallback."}`,
    });
    await trace.persist();

    ctx.log("info", "Charge extraction complete", {
      encounterId,
      chargeCount: createdCharges.length,
      usedLLM,
    });

    return {
      encounterId,
      charges,
      usedLLM,
    };
  },
};
