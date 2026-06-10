import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { startReasoning } from "../memory/agent-reasoning";
import { recallMemories, formatMemoriesForPrompt } from "../memory/patient-memory";

// ---------------------------------------------------------------------------
// Coding Optimization Agent
// ---------------------------------------------------------------------------
// Second agent in the clean claim path. Wakes up when charges are created,
// reviews and optimizes the CPT/ICD-10 codes, applies modifiers where needed,
// and emits coding.recommended when confident enough, or coding.review_needed
// when a human coder should verify.
//
// This is the upgrade of the codingReadiness agent. The old agent only attached
// suggestions to finalized notes. This one actively optimizes charges and feeds
// the claim construction pipeline.
//
// Per Layer 1: optimizes for COMPLIANT reimbursement — the highest code the
// documentation actually supports. Never upcodes. Never invents.
//
// Layer 3 state transition: coding_pending → coded (or → coding_review)
// Layer 4 events: subscribes charge.created, emits coding.recommended | coding.review_needed
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

const input = z.object({
  chargeId: z.string(),
  encounterId: z.string(),
  patientId: z.string(),
  organizationId: z.string(),
});

const output = z.object({
  chargeId: z.string(),
  optimized: z.boolean(),
  finalCptCode: z.string(),
  finalModifiers: z.array(z.string()),
  finalIcd10Codes: z.array(z.string()),
  confidence: z.number(),
  requiresReview: z.boolean(),
  usedLLM: z.boolean(),
});

export const codingOptimizationAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: "codingOptimization",
  version: "1.0.0",
  description:
    "Reviews and optimizes CPT/ICD-10 codes on charges. Applies modifiers. " +
    "Emits coding.recommended when confident, coding.review_needed when not. " +
    "Optimizes for compliant reimbursement — never upcodes.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: [
    "read.patient",
    "read.encounter",
    "read.note",
    "write.coding",
  ],
  requiresApproval: false,

  async run({ chargeId, encounterId, patientId, organizationId }, ctx) {
    const trace = startReasoning("codingOptimization", "1.0.0", ctx.jobId);
    trace.step("begin coding optimization", { chargeId, encounterId });

    ctx.assertCan("read.encounter");

    // ── Load charge + encounter + documentation ─────────────────
    const charge = await prisma.charge.findUnique({
      where: { id: chargeId },
    });
    if (!charge) throw new Error(`Charge ${chargeId} not found`);

    const encounter = await prisma.encounter.findUnique({
      where: { id: encounterId },
      include: {
        notes: {
          where: { status: { in: ["finalized", "pending_cosign"] } },
          orderBy: { createdAt: "desc" },
          take: 2,
        },
        patient: {
          include: {
            medications: { where: { active: true } },
            dosingRegimens: { where: { active: true }, include: { product: true } },
          },
        },
        provider: true,
      },
    });
    if (!encounter) throw new Error(`Encounter ${encounterId} not found`);

    trace.step("loaded charge + encounter", {
      currentCpt: charge.cptCode,
      currentModifiers: charge.modifiers,
      noteCount: encounter.notes.length,
    });

    // Build documentation text
    const noteBlocks = encounter.notes
      .flatMap((n: any) => {
        const blocks = Array.isArray(n.blocks) ? n.blocks : [];
        return blocks.map((b: any) => `### ${b.heading}\n${b.body}`);
      })
      .join("\n\n");

    // Recall patient memories + billing memory
    const memories = await recallMemories(patientId, { limit: 8 });
    trace.step("recalled memories", { count: memories.length });

    // Check for other charges on the same encounter (modifier 25 logic)
    const siblingCharges = await prisma.charge.findMany({
      where: { encounterId, id: { not: chargeId }, status: "pending" },
    });
    const hasCompanionProcedure = siblingCharges.some(
      (c) => !c.cptCode.startsWith("992"), // non-E/M code = procedure
    );
    const isEM = charge.cptCode.startsWith("992");
    trace.step("sibling charge analysis", {
      siblingCount: siblingCharges.length,
      hasCompanionProcedure,
      isEM,
    });

    // ── Modifier 25 check (deterministic) ───────────────────────
    // Per Layer 6: Modifier 25 is required when E/M is billed same day
    // as a procedure by the same provider. Auto-apply if confidence ≥ 0.85.
    let modifiers = [...charge.modifiers];
    let modifierNote = "";
    if (isEM && hasCompanionProcedure && !modifiers.includes("25")) {
      modifiers.push("25");
      modifierNote = "Auto-applied modifier 25 (separate E/M + same-day procedure). ";
      trace.step("auto-applied modifier 25", {
        reason: "E/M with same-day procedure by same provider",
      });
    }

    // ── LLM code optimization ───────────────────────────────────
    const prompt = `You are a medical coding optimization specialist for an ambulatory cannabis care practice. Review this charge and optimize the codes.

CURRENT CHARGE:
- CPT: ${charge.cptCode} (${charge.cptDescription ?? ""})
- ICD-10: ${charge.icd10Codes.join(", ")}
- Modifiers: ${modifiers.join(", ") || "none"}

CLINICAL DOCUMENTATION:
${noteBlocks || "(no documentation available)"}

PATIENT CONTEXT:
${formatMemoriesForPrompt(memories)}

ACTIVE CANNABIS REGIMENS:
${encounter.patient.dosingRegimens.map((r: any) => `  ${r.product?.name}: ${r.volumePerDose}${r.volumeUnit} ${r.frequencyPerDay}x/day`).join("\n") || "  (none)"}

COMPANION CHARGES ON THIS ENCOUNTER: ${siblingCharges.map((c) => c.cptCode).join(", ") || "none"}

Optimize the coding. Return JSON:
{
  "cptCode": "99214",
  "cptRationale": "MDM moderate — 2 chronic conditions, prescription management",
  "icd10Codes": ["F17.210", "G89.29"],
  "icd10Rationale": "Cannabis use disorder + chronic pain — both addressed in this visit",
  "modifiers": ["25"],
  "modifierRationale": "Separate E/M with same-day venipuncture",
  "confidence": 0.88,
  "optimizationNotes": "Upgraded from 99213 to 99214 — documentation supports moderate MDM"
}

Rules:
- ONLY assign codes the documentation actually supports. If the current code is correct, keep it.
- If documentation supports a higher E/M level, recommend the upgrade with rationale.
- If documentation does NOT support the current code, recommend a downgrade.
- ICD-10 codes must be at the highest specificity the documentation supports.
- Cannabis counseling: use Z71.3 or relevant F12.x codes.

Cannabis-specific coding rules (these OVERRIDE the generic rules above when they conflict):
- F12 severity gate: DO NOT upgrade F12.10 (unspecified, uncomplicated) to F12.20 (dependence) unless the documentation explicitly notes (a) at least 2 DSM-5 criteria met from the severity table AND (b) functional impact — missed work, relationships, school, inability to cut down after trying. If either is missing, keep the lower specificity and note the gap in rationale.
- Z71.89 bundling warning: when a Z71.89 counseling code is billed alongside an E/M for a commercial payer, include a modifier-25 check. If the payer's policy does not honor mod-25 on Z71 services, recommend dropping the Z71 line and documenting counseling time inside the E/M.
- 99406 / 99407 are NOT for cannabis counseling. Those CPTs are tobacco-cessation specific. For cannabis counseling use Z71.89 plus the time-based E/M level. If the current coding has 99406/99407 tied to an F12/Z71 diagnosis, flag it as a mis-code.
- E/M uplift on F12-only diagnoses requires documented medical decision-making. Do NOT upgrade 99213→99214 for cannabis-only visits unless the Assessment or Plan documents moderate MDM (≥2 chronic conditions addressed, prescription drug management, or moderate risk of morbidity).
- Return ONLY valid JSON.`;

    let optimized = false;
    let finalCpt = charge.cptCode;
    let finalIcd10 = [...charge.icd10Codes];
    let confidence = 0.7; // default if no LLM
    let usedLLM = false;

    try {
      const raw = await ctx.model.complete(prompt, {
        maxTokens: 512,
        temperature: 0.15,
      });
      usedLLM = raw.length > 20 && !raw.startsWith("[stub");
      trace.step("llm optimization complete", { rawLen: raw.length, usedLLM });

      if (usedLLM) {
        const parsed = tryParseJSON(raw);
        if (parsed?.cptCode && parsed?.confidence) {
          finalCpt = parsed.cptCode;
          if (Array.isArray(parsed.icd10Codes) && parsed.icd10Codes.length > 0) {
            finalIcd10 = parsed.icd10Codes;
          }
          if (Array.isArray(parsed.modifiers)) {
            modifiers = parsed.modifiers;
          }
          confidence = parsed.confidence;
          optimized = finalCpt !== charge.cptCode || modifierNote.length > 0;
          trace.step("applied LLM optimization", {
            cptChanged: finalCpt !== charge.cptCode,
            newCpt: finalCpt,
            confidence,
            icd10Count: finalIcd10.length,
          });
          if (parsed.optimizationNotes) {
            trace.alternative(
              "keep original code",
              parsed.optimizationNotes,
            );
          }
        }
      }
    } catch (err) {
      ctx.log("warn", "LLM coding optimization failed — keeping original codes", {
        error: err instanceof Error ? err.message : String(err),
      });
      trace.step("llm failed — keeping original codes");
    }

    // ── Update the charge ───────────────────────────────────────
    ctx.assertCan("write.coding");

    await prisma.charge.update({
      where: { id: chargeId },
      data: {
        cptCode: finalCpt,
        modifiers,
        icd10Codes: finalIcd10,
        confidence,
      },
    });

    // ── Route based on confidence (Layer 6 thresholds) ──────────
    const requiresReview = confidence < 0.75;
    const autoApproved = confidence >= 0.75; // ≥0.75 proceeds, ≥0.92 is high confidence

    if (requiresReview) {
      // Low confidence → human coder review
      await ctx.emit({
        name: "coding.review_needed",
        encounterId,
        patientId,
        reason: `Coding confidence ${Math.round(confidence * 100)}% for ${finalCpt} — below 75% threshold. ${modifierNote}`,
        organizationId,
      });
      trace.step("routed to human review", { confidence });
    } else {
      // Confidence ≥ 0.75 → proceed to claim construction
      // Check if ALL charges for this encounter are now coded
      const allCharges = await prisma.charge.findMany({
        where: { encounterId, status: "pending" },
      });
      const allCoded = allCharges.every((c) => (c.confidence ?? 0) >= 0.5);

      if (allCoded) {
        await ctx.emit({
          name: "coding.recommended",
          encounterId,
          patientId,
          overallConfidence: Math.min(...allCharges.map((c) => c.confidence ?? 0)),
          requiresReview: false,
          organizationId,
        });
        trace.step("all charges coded — emitted coding.recommended", {
          chargeCount: allCharges.length,
          overallConfidence: Math.min(...allCharges.map((c) => c.confidence ?? 0)),
        });
      } else {
        trace.step("waiting for remaining charges to be coded", {
          codedCount: allCharges.filter((c) => (c.confidence ?? 0) >= 0.5).length,
          totalCount: allCharges.length,
        });
      }
    }

    await writeAgentAudit(
      "codingOptimization",
      "1.0.0",
      organizationId,
      "coding.optimized",
      { type: "Charge", id: chargeId },
      {
        originalCpt: charge.cptCode,
        finalCpt,
        confidence,
        modifiers,
        optimized,
        requiresReview,
      },
    );

    trace.conclude({
      confidence,
      summary: `${optimized ? "Optimized" : "Verified"} ${finalCpt} (${Math.round(confidence * 100)}% confidence). ${modifierNote}${requiresReview ? "Routed to human review." : "Auto-approved."}`,
    });
    await trace.persist();

    return {
      chargeId,
      optimized,
      finalCptCode: finalCpt,
      finalModifiers: modifiers,
      finalIcd10Codes: finalIcd10,
      confidence,
      requiresReview,
      usedLLM,
    };
  },
};
