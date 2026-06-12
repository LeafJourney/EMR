"use server";

/**
 * EMR-166 follow-on — persisted Clinical Decision Support acknowledgements.
 *
 * Dr. Patel: once a provider acknowledges a CDS suggestion it should be "placed
 * in chart and then not have to be acknowledged again for another 30-90 days
 * based on the urgency and severity." Critical suggestions cannot be dismissed
 * and require a justification.
 *
 * Acks are keyed by a STABLE content-derived `alertKey` ("<category>::<title>")
 * rather than the volatile index-based alert id (see generateCDSAlerts), so a
 * sign-off sticks to the same logical alert across re-renders.
 *
 * Sign-off is attributed to the authenticated (Clerk) session user server-side.
 * We deliberately do NOT render a "type your password" gate: auth is
 * session-based, so an in-app password field couldn't actually be verified —
 * a mandatory justification + authenticated attribution is the honest control.
 */

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { assertChartAccess } from "@/lib/rbac/permissions";

export type CdsAckAction = "acknowledge" | "dismiss";
export type CdsSeverity = "critical" | "warning" | "info";

/** Re-prompt window by severity — more urgent ⇒ shorter snooze. */
const SNOOZE_DAYS: Record<CdsSeverity, number> = {
  critical: 30,
  warning: 60,
  info: 90,
};

export interface CdsAckRecord {
  alertKey: string;
  action: CdsAckAction;
  comment: string | null;
  acknowledgedAt: string;
  snoozeUntil: string;
}

export interface CdsAckResult {
  ok: boolean;
  error?: string;
}

/** Active (not-yet-expired) acknowledgements for a patient's CDS panel. */
export async function loadActiveCdsAcks(patientId: string): Promise<CdsAckRecord[]> {
  const user = await requireUser();
  await assertChartAccess(user, patientId);

  const rows = await prisma.cdsAcknowledgement.findMany({
    where: { patientId, snoozeUntil: { gt: new Date() } },
  });

  return rows.map((r) => ({
    alertKey: r.alertKey,
    action: r.action as CdsAckAction,
    comment: r.comment,
    acknowledgedAt: r.acknowledgedAt.toISOString(),
    snoozeUntil: r.snoozeUntil.toISOString(),
  }));
}

export async function acknowledgeCdsAlert(input: {
  patientId: string;
  alertKey: string;
  severity: CdsSeverity;
  action: CdsAckAction;
  comment?: string;
}): Promise<CdsAckResult> {
  const user = await requireUser();
  await assertChartAccess(user, input.patientId);

  // Critical-alert gating (mirrored client-side, enforced here):
  //  - critical alerts cannot be dismissed
  //  - acknowledging a critical alert requires a written justification
  if (input.severity === "critical") {
    if (input.action === "dismiss") {
      return { ok: false, error: "Critical alerts cannot be dismissed — acknowledge with a justification instead." };
    }
    if (!input.comment || input.comment.trim().length < 10) {
      return { ok: false, error: "A justification (at least 10 characters) is required to acknowledge a critical alert." };
    }
  }

  const days = SNOOZE_DAYS[input.severity] ?? 60;
  const snoozeUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const comment = input.comment?.trim() || null;

  await prisma.cdsAcknowledgement.upsert({
    where: {
      patientId_alertKey: { patientId: input.patientId, alertKey: input.alertKey },
    },
    create: {
      patientId: input.patientId,
      alertKey: input.alertKey,
      severity: input.severity,
      action: input.action,
      comment,
      acknowledgedById: user.id,
      snoozeUntil,
    },
    update: {
      severity: input.severity,
      action: input.action,
      comment,
      acknowledgedById: user.id,
      acknowledgedAt: new Date(),
      snoozeUntil,
    },
  });

  return { ok: true };
}
