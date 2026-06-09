"use server";

import { requireUser } from "@/lib/auth/session";
import { sendManualAppointmentReminder } from "@/lib/scheduling/send-reminders";

export type SendReminderNowResult =
  | { ok: true; delivery: "delivered" | "recorded" | "failed"; detail: string }
  | { ok: false; error: string };

/**
 * EMR-808 — operator presses "Send now" on an at-risk visit. Performs a REAL
 * SMS reminder via the comms adapter (Twilio in prod, honest mock in dev) and
 * returns the truthful outcome — no fake "sent" toast. The cockpit previously
 * only previewed the reminder timeline; this makes the button actually send.
 */
export async function sendVisitReminderNow(
  appointmentId: string,
): Promise<SendReminderNowResult> {
  const user = await requireUser();
  if (!user.organizationId) return { ok: false, error: "No organization context." };

  const res = await sendManualAppointmentReminder({
    appointmentId,
    organizationId: user.organizationId,
    actorUserId: user.id,
  });

  if (!res.ok && res.delivery === "failed") {
    return { ok: false, error: res.detail };
  }
  return { ok: true, delivery: res.delivery, detail: res.detail };
}
