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

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  ForbiddenError,
  assertChartAccess,
  hasPermission,
} from "@/lib/rbac/permissions";
import { computeIrRisk } from "@/lib/clinical/ambient-cds/ir-risk";
import {
  assembleBiomarkers,
  type AssembledBiomarkers,
} from "@/lib/clinical/ambient-cds/lab-profile";
import type { IrRiskResult } from "@/lib/clinical/ambient-cds/types";

// Look back two years for the biomarker anchor; the engine flags anything
// past the 180-day freshness window as low-confidence rather than dropping it.
const LAB_LOOKBACK_DAYS = 730;

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

  const since = new Date(Date.now() - LAB_LOOKBACK_DAYS * 86_400_000);
  const labs = await prisma.labResult.findMany({
    where: {
      patientId,
      organizationId: user.organizationId!,
      receivedAt: { gte: since },
    },
    orderBy: { receivedAt: "desc" },
    select: { panelName: true, receivedAt: true, results: true },
    take: 60,
  });

  const { panel, sources } = assembleBiomarkers(
    labs.map((l) => ({
      panelName: l.panelName,
      receivedAt: l.receivedAt,
      results: l.results,
    }))
  );

  // Labs-only today — no persisted CGM/HRV telemetry source (see file note).
  const result = computeIrRisk({ biomarkers: panel }, new Date());

  return { ok: true, result, sources };
}
