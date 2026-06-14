"use server";

/**
 * EMR-1128 / EMR-1127 — Ambient insulin-resistance assessment for the lab
 * review surface.
 *
 * When a clinician opens a metabolic panel, the overlay asks this action for
 * the patient's wearable-augmented IR_risk. It assembles the BiomarkerPanel
 * from the patient's recent LabResult rows across panels (the
 * `assembleBiomarkers` mapper) and runs the deterministic engine.
 *
 * Telemetry note: no granular CGM/HRV time-series is persisted today
 * (DeviceConnection stores only sync metadata), so the assessment runs
 * labs-only. The engine degrades gracefully and reports `wearableAugmented:
 * false` — we never fabricate a wearable signal. When a telemetry store
 * lands, pass `{ telemetry }` here and the score sharpens automatically.
 *
 * Org-scoped + permission-gated identically to the lab-review page
 * (notes.read + chart access).
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  ForbiddenError,
  assertChartAccess,
  hasPermission,
  requirePermission,
} from "@/lib/rbac/permissions";
import { computeIrRisk } from "@/lib/clinical/ambient-cds/ir-risk";
import {
  assembleBiomarkers,
  type AssembledBiomarkers,
} from "@/lib/clinical/ambient-cds/lab-profile";
import {
  recommendIrInterventions,
  type IrIntervention,
} from "@/lib/clinical/ambient-cds/interventions";
import type { IrRiskResult } from "@/lib/clinical/ambient-cds/types";

// Look back two years for the biomarker anchor; the engine flags anything
// past the 180-day freshness window as low-confidence rather than dropping it.
const LAB_LOOKBACK_DAYS = 730;

/** Shared lab read used by both the assessment and the staging action. */
async function loadBiomarkers(patientId: string, organizationId: string) {
  const since = new Date(Date.now() - LAB_LOOKBACK_DAYS * 86_400_000);
  const labs = await prisma.labResult.findMany({
    where: { patientId, organizationId, receivedAt: { gte: since } },
    orderBy: { receivedAt: "desc" },
    select: { panelName: true, receivedAt: true, results: true },
    take: 60,
  });
  return assembleBiomarkers(
    labs.map((l) => ({
      panelName: l.panelName,
      receivedAt: l.receivedAt,
      results: l.results,
    }))
  );
}

export type AssessIrRiskResult =
  | {
      ok: true;
      /** Null when no fasting glucose + insulin pair is on file. */
      result: IrRiskResult | null;
      sources: AssembledBiomarkers["sources"];
    }
  | { ok: false; error: string };

export async function assessIrRiskAction(
  patientId: string
): Promise<AssessIrRiskResult> {
  const user = await requireUser();
  if (!hasPermission(user, "notes.read")) {
    return { ok: false, error: "Not permitted to view clinical data." };
  }

  try {
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Chart access denied." };
    }
    throw err;
  }

  const { panel, sources } = await loadBiomarkers(
    patientId,
    user.organizationId!
  );

  // Labs-only today — no persisted CGM/HRV telemetry source (see file note).
  const result = computeIrRisk({ biomarkers: panel }, new Date());

  return { ok: true, result, sources };
}

// ---------------------------------------------------------------------------
// One-click intervention staging (EMR-1129)
// ---------------------------------------------------------------------------

export type StagedHandout = {
  title: string;
  /** Plain-language lifestyle/care text for the patient. */
  body: string;
};

export type StageIrInterventionsResult =
  | {
      ok: true;
      /** ClinicalOrder ids created as DRAFTs (nothing auto-placed/signed). */
      draftOrderIds: string[];
      /** Drafted patient handout, or null when no lifestyle items were chosen. */
      handout: StagedHandout | null;
      summary: string;
    }
  | { ok: false; error: string };

/**
 * Stage the selected ambient-CDS interventions for the patient:
 *   - each lab-backed intervention → a DRAFT ClinicalOrder (status "draft",
 *     transmissionMode "simulated") the provider reviews + places manually;
 *   - lifestyle/diet/monitoring items → a drafted patient handout (returned
 *     for review, not auto-sent).
 * Nothing auto-signs. Audit-logged as an agent-assisted draft.
 *
 * Interventions are re-derived server-side from the patient's labs — the
 * client only passes which ids it selected, never the clinical content.
 */
export async function stageIrInterventionsAction(
  patientId: string,
  selectedIds: string[]
): Promise<StageIrInterventionsResult> {
  const user = await requireUser();

  try {
    // Diagnostic ordering grant (same key the lab/imaging order forms use).
    requirePermission(user, "labs.sign");
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "You don't have permission to place orders." };
    }
    throw err;
  }

  if (!Array.isArray(selectedIds) || selectedIds.length === 0) {
    return { ok: false, error: "Nothing selected." };
  }
  const wanted = new Set(selectedIds);

  // Re-derive the canonical interventions; never trust client clinical content.
  const { panel } = await loadBiomarkers(patientId, user.organizationId!);
  const result = computeIrRisk({ biomarkers: panel }, new Date());
  if (!result) {
    return { ok: false, error: "No insulin-resistance assessment available." };
  }
  const chosen = recommendIrInterventions(result).filter((i) =>
    wanted.has(i.id)
  );
  if (chosen.length === 0) {
    return { ok: false, error: "Selected items are no longer applicable." };
  }

  const orderedByName =
    `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;

  // Create draft orders for the lab-backed picks.
  const labPicks = chosen.filter(
    (i): i is IrIntervention & { labOrder: NonNullable<IrIntervention["labOrder"]> } =>
      Boolean(i.labOrder)
  );
  const draftOrderIds: string[] = [];
  for (const pick of labPicks) {
    const order = await prisma.clinicalOrder.create({
      data: {
        organizationId: user.organizationId!,
        patientId,
        orderType: "lab",
        orderCode: pick.labOrder.orderCode,
        orderName: pick.labOrder.orderName,
        priority: "routine",
        diagnosisCodes: pick.labOrder.diagnosisCodes,
        payload: {
          source: "ambient-cds/ir-risk",
          interventionId: pick.id,
          fasting: pick.labOrder.fasting ?? false,
          instructions: pick.labOrder.instructions ?? null,
          irRiskScore: result.score,
          irRiskBand: result.band,
        },
        // DRAFT — the provider reviews and places it; nothing auto-signs.
        status: "draft",
        transmissionMode: "simulated",
        orderedById: user.id,
        orderedByName,
      },
      select: { id: true },
    });
    draftOrderIds.push(order.id);
  }

  // Compose a patient handout from the non-lab lifestyle/care picks.
  const handoutItems = chosen.filter((i) => !i.labOrder);
  const handout: StagedHandout | null =
    handoutItems.length > 0
      ? {
          title: "Your metabolic health plan",
          body: handoutItems
            .map((i) => `• ${i.title}${i.detail ? `: ${i.detail}` : ""}`)
            .join("\n"),
        }
      : null;

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: "ambientCds.intervention.staged",
      subjectType: "Patient",
      subjectId: patientId,
      metadata: {
        source: "ambient-cds/ir-risk",
        irRiskScore: result.score,
        irRiskBand: result.band,
        selectedInterventionIds: chosen.map((i) => i.id),
        draftOrderIds,
        handout,
        agentAssistedDraft: true,
      },
    },
  });

  revalidatePath(`/clinic/patients/${patientId}/orders/labs`);
  revalidatePath(`/clinic/patients/${patientId}`);

  const orderWord = draftOrderIds.length === 1 ? "order" : "orders";
  const summary =
    `Drafted ${draftOrderIds.length} follow-up ${orderWord}` +
    (handout ? " + patient handout" : "") +
    ". Review and place in the Orders tab — nothing was signed.";

  return { ok: true, draftOrderIds, handout, summary };
}
