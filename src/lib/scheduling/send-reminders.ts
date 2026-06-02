// Scans upcoming appointments and dispatches SMS reminders that are
// due at the current scheduler tick. Pure side-effect helper called
// from src/workers/scheduler.ts every 15 minutes.

import { prisma } from "@/lib/db/prisma";
import { getSmsAdapter, normalizePhone } from "@/lib/sms/adapter";
import {
  pickReminderOffset,
  renderAppointmentReminder,
  type ReminderOffset,
} from "@/lib/sms/templates";
import {
  renderPrevisitReminder,
  renderPrevisitEmail,
  renderPrevisitInApp,
  type PrevisitMilestone,
} from "@/lib/sms/previsit-templates";
import { sendEmail } from "@/lib/email/resend";
import { logger } from "@/lib/observability/log";
import { getAppointmentReadiness } from "./previsit-readiness";
import {
  resolvePrevisitChannels,
  readPrevisitCategoryToggles,
  type PrevisitChannel,
} from "./previsit-channels";

export interface SendDueRemindersInput {
  /** Current time, injected for testability. */
  now: Date;
  /** Scheduler tick interval. Defaults to 15 min. */
  tickIntervalMs?: number;
}

export interface SendDueRemindersResult {
  /** Number of reminders successfully sent. */
  sent: number;
  /** Number of appointments inspected but skipped (no phone, already sent, etc). */
  skipped: number;
  /** Per-appointment outcomes for observability + tests. */
  details: ReminderOutcome[];
}

export interface ReminderOutcome {
  appointmentId: string;
  reminderType: ReminderOffset | null;
  result: "sent" | "skipped:no-phone" | "skipped:already-sent" | "skipped:out-of-window" | "failed";
  error?: string;
  adapter?: "twilio" | "mock";
}

export async function sendDueAppointmentReminders(
  input: SendDueRemindersInput,
): Promise<SendDueRemindersResult> {
  const now = input.now;
  const tick = input.tickIntervalMs ?? 15 * 60_000;
  const day = 24 * 60 * 60_000;
  // Pull every confirmed/requested appointment in the next 7d+1h so the
  // 7-day window is always covered.
  const windowEnd = new Date(now.getTime() + 7 * day + 60 * 60_000);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ["requested", "confirmed"] },
      startAt: { gt: now, lte: windowEnd },
    },
    include: {
      patient: { select: { id: true, firstName: true, phone: true, organizationId: true } },
      provider: { include: { user: true } },
    },
  });

  const details: ReminderOutcome[] = [];
  let sent = 0;
  let skipped = 0;

  for (const appt of appointments) {
    const msUntil = appt.startAt.getTime() - now.getTime();
    const offset = pickReminderOffset(msUntil, tick);
    if (!offset) {
      details.push({
        appointmentId: appt.id,
        reminderType: null,
        result: "skipped:out-of-window",
      });
      skipped += 1;
      continue;
    }

    if (!appt.patient.phone) {
      details.push({
        appointmentId: appt.id,
        reminderType: offset,
        result: "skipped:no-phone",
      });
      skipped += 1;
      continue;
    }
    const phone = normalizePhone(appt.patient.phone);
    if (!phone) {
      details.push({
        appointmentId: appt.id,
        reminderType: offset,
        result: "skipped:no-phone",
      });
      skipped += 1;
      continue;
    }

    if (await alreadySent(appt.id, offset)) {
      details.push({
        appointmentId: appt.id,
        reminderType: offset,
        result: "skipped:already-sent",
      });
      skipped += 1;
      continue;
    }

    const providerName = appt.provider?.user
      ? `${appt.provider.title ?? "Provider"} ${appt.provider.user.firstName} ${appt.provider.user.lastName}`.trim()
      : "your care team";

    const body = renderAppointmentReminder(offset, {
      patientFirstName: appt.patient.firstName,
      providerName,
      appointmentAt: appt.startAt,
      modality: appt.modality,
    });

    const adapter = getSmsAdapter();
    const res = await adapter.send({
      to: phone,
      body,
      context: {
        appointmentId: appt.id,
        patientId: appt.patient.id,
        reminderType: offset,
      },
    });

    if (!res.ok) {
      details.push({
        appointmentId: appt.id,
        reminderType: offset,
        result: "failed",
        error: res.error,
        adapter: res.adapter,
      });
      logger.warn({
        event: "scheduler.sms.reminder.failed",
        appointmentId: appt.id,
        reminderType: offset,
        error: res.error,
      });
      continue;
    }

    await prisma.auditLog.create({
      data: {
        organizationId: appt.patient.organizationId,
        actorAgent: "scheduler:appointmentReminder@1.0.0",
        action: "sms.appointment.reminder.sent",
        subjectType: "Appointment",
        subjectId: appt.id,
        metadata: {
          reminderType: offset,
          messageId: res.messageId,
          adapter: res.adapter,
        } as any,
      },
    });

    details.push({
      appointmentId: appt.id,
      reminderType: offset,
      result: "sent",
      adapter: res.adapter,
    });
    sent += 1;
  }

  return { sent, skipped, details };
}

async function alreadySent(
  appointmentId: string,
  reminderType: ReminderOffset,
): Promise<boolean> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: "sms.appointment.reminder.sent",
      subjectType: "Appointment",
      subjectId: appointmentId,
    },
    select: { metadata: true },
    take: 10,
  });
  return rows.some((r) => {
    const meta = r.metadata as { reminderType?: string } | null;
    return meta?.reminderType === reminderType;
  });
}

// ===========================================================================
// Pre-visit COMPLETION reminders (EMR-212 follow-on)
//
// Distinct from the appointment reminders above. These nudge a patient to
// finish outstanding *intake* requirements through the portal, and are sent
// ONLY when required items remain incomplete, on a 7d / 2d / morning-of
// cadence. The copy is STRICTLY PHI-free: it says "you have pre-visit items
// ready" and links to the bare portal origin — identity/appointment specifics
// live behind portal login. Sends are idempotent per appointment+milestone and
// audited with opaque ids + counts only (never labels or PHI).
// ===========================================================================

/** Audit action for a pre-visit completion nudge. */
export const PREVISIT_COMPLETION_REMINDER_ACTION =
  "previsit.completion.reminder.sent" as const;

const PREVISIT_MS_DAY = 24 * 60 * 60_000;

/**
 * Which completion-reminder milestone (if any) is due today for an appointment
 * starting at `startAt`. Uses UTC calendar-day offsets so a once-daily job
 * fires exactly one nudge per milestone. Returns null off-cadence or once the
 * visit has started.
 */
export function pickPrevisitMilestone(
  now: Date,
  startAt: Date,
): PrevisitMilestone | null {
  if (now.getTime() >= startAt.getTime()) return null;
  const a = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const b = Date.UTC(
    startAt.getUTCFullYear(),
    startAt.getUTCMonth(),
    startAt.getUTCDate(),
  );
  const days = Math.round((b - a) / PREVISIT_MS_DAY);
  if (days === 7) return "7day";
  if (days === 2) return "2day";
  if (days === 0) return "morning_of";
  return null;
}

export interface SendPrevisitRemindersInput {
  now: Date;
  /** Generic portal origin; no PHI/path/query (validated by the renderer). */
  portalUrl: string;
}

export type PrevisitReminderResult =
  | "sent"
  | "skipped:out-of-window"
  | "skipped:complete"
  | "skipped:already-sent"
  | "skipped:no-channel"
  | "skipped:channel-unconfigured"
  | "failed";

export interface PrevisitReminderOutcome {
  appointmentId: string;
  milestone: PrevisitMilestone | null;
  /** Which channel this outcome is for. Null for whole-appointment skips. */
  channel?: PrevisitChannel | null;
  result: PrevisitReminderResult;
  error?: string;
}

export interface SendPrevisitRemindersResult {
  sent: number;
  skipped: number;
  details: PrevisitReminderOutcome[];
}

export type PrevisitReminderSkippedReason =
  | "portal-url-missing"
  | "portal-url-invalid";

export interface SendDueVisitRemindersInput extends SendDueRemindersInput {
  /** Bare HTTPS portal origin. If absent/invalid, pre-visit nudges stay quarantined. */
  portalUrl?: string | null;
}

export interface SendDueVisitRemindersResult {
  appointment: SendDueRemindersResult;
  previsit: SendPrevisitRemindersResult | null;
  previsitSkippedReason?: PrevisitReminderSkippedReason;
}

export async function sendDuePrevisitCompletionReminders(
  input: SendPrevisitRemindersInput,
): Promise<SendPrevisitRemindersResult> {
  const now = input.now;
  const windowEnd = new Date(now.getTime() + 7 * PREVISIT_MS_DAY + 60 * 60_000);

  const appointments = await prisma.appointment.findMany({
    where: {
      status: { in: ["requested", "confirmed"] },
      startAt: { gt: now, lte: windowEnd },
    },
    include: {
      patient: {
        select: { id: true, phone: true, email: true, userId: true, organizationId: true },
      },
    },
  });

  const details: PrevisitReminderOutcome[] = [];
  let sent = 0;
  let skipped = 0;

  for (const appt of appointments) {
    const milestone = pickPrevisitMilestone(now, appt.startAt);
    if (!milestone) {
      details.push({ appointmentId: appt.id, milestone: null, result: "skipped:out-of-window" });
      skipped += 1;
      continue;
    }

    // Only nudge patients with outstanding required items.
    const readiness = await getAppointmentReadiness(appt.id, now);
    if (!readiness || readiness.readiness.isReady) {
      details.push({ appointmentId: appt.id, milestone, result: "skipped:complete" });
      skipped += 1;
      continue;
    }

    // Which channels may we use? Opt-out model keyed on CommunicationPreference
    // (loaded only when the patient has a portal account); a normalizable phone
    // gates SMS, an address gates email, a portal user gates in-app.
    const phone = normalizePhone(appt.patient.phone);
    const prefRow = appt.patient.userId
      ? await prisma.communicationPreference.findUnique({
          where: { userId: appt.patient.userId },
          select: { emailFrequency: true, preferences: true },
        })
      : null;
    const channels = resolvePrevisitChannels({
      hasPhone: phone != null,
      hasEmail: Boolean(appt.patient.email),
      hasPortalUser: Boolean(appt.patient.userId),
      prefs: prefRow
        ? {
            emailFrequency: prefRow.emailFrequency,
            category: readPrevisitCategoryToggles(prefRow.preferences),
          }
        : null,
    });

    if (channels.length === 0) {
      details.push({ appointmentId: appt.id, milestone, channel: null, result: "skipped:no-channel" });
      skipped += 1;
      continue;
    }

    for (const channel of channels) {
      // Channel-aware idempotency: each (appointment, milestone, channel) fires
      // at most once, so SMS + email + in-app each send once per milestone.
      if (await alreadySentPrevisit(appt.id, milestone, channel)) {
        details.push({ appointmentId: appt.id, milestone, channel, result: "skipped:already-sent" });
        skipped += 1;
        continue;
      }

      const send = await sendPrevisitChannel({
        channel,
        milestone,
        portalUrl: input.portalUrl,
        phone,
        email: appt.patient.email,
        userId: appt.patient.userId,
      });

      if (send.outcome === "unconfigured") {
        details.push({ appointmentId: appt.id, milestone, channel, result: "skipped:channel-unconfigured" });
        skipped += 1;
        continue;
      }
      if (send.outcome === "failed") {
        details.push({ appointmentId: appt.id, milestone, channel, result: "failed", error: send.error });
        logger.warn({
          event: "scheduler.previsit.reminder.failed",
          appointmentId: appt.id,
          milestone,
          channel,
          error: send.error,
        });
        continue;
      }

      await prisma.auditLog.create({
        data: {
          organizationId: appt.patient.organizationId,
          actorAgent: "scheduler:previsitCompletionReminder@1.0.0",
          action: PREVISIT_COMPLETION_REMINDER_ACTION,
          subjectType: "Appointment",
          subjectId: appt.id,
          // PHI-free metadata: milestone, channel, opaque delivery id, and a
          // count of outstanding required items. Never the labels or any field.
          metadata: {
            milestone,
            channel,
            outstandingCount: readiness.readiness.outstandingRequiredCount,
            ...send.meta,
          } as any,
        },
      });

      details.push({ appointmentId: appt.id, milestone, channel, result: "sent" });
      sent += 1;
    }
  }

  return { sent, skipped, details };
}

type ChannelSendResult =
  | { outcome: "sent"; meta: Record<string, unknown> }
  | { outcome: "failed"; error?: string }
  | { outcome: "unconfigured" };

/**
 * Deliver one pre-visit nudge on one channel. PHI-free copy throughout; returns
 * "unconfigured" when a channel's transport isn't set up (e.g. no Resend key) so
 * the caller records a skip rather than a failure and never audits a non-send.
 */
async function sendPrevisitChannel(args: {
  channel: PrevisitChannel;
  milestone: PrevisitMilestone;
  portalUrl: string;
  phone: string | null;
  email: string | null;
  userId: string | null;
}): Promise<ChannelSendResult> {
  const { channel, milestone, portalUrl } = args;

  if (channel === "sms") {
    if (!args.phone) return { outcome: "unconfigured" };
    const body = renderPrevisitReminder(milestone, { portalUrl });
    const res = await getSmsAdapter().send({
      to: args.phone,
      body,
      // Context is for delivery/idempotency only — opaque ids, no PHI.
      context: { milestone, channel, kind: "previsit_completion" },
    });
    if (!res.ok) return { outcome: "failed", error: res.error };
    return { outcome: "sent", meta: { messageId: res.messageId, adapter: res.adapter } };
  }

  if (channel === "email") {
    if (!args.email) return { outcome: "unconfigured" };
    const content = renderPrevisitEmail(milestone, { portalUrl });
    const res = await sendEmail({
      to: [args.email],
      subject: content.subject,
      text: content.text,
      html: content.html,
    });
    if (res.ok) return { outcome: "sent", meta: { messageId: res.id } };
    // A missing API key is a config gap, not a delivery failure — skip quietly.
    if (res.reason === "no-api-key") return { outcome: "unconfigured" };
    return { outcome: "failed", error: res.message };
  }

  // in-app — write a portal Notification (only patients with a portal account).
  if (!args.userId) return { outcome: "unconfigured" };
  const content = renderPrevisitInApp(milestone, { portalUrl });
  const note = await prisma.notification.create({
    data: {
      userId: args.userId,
      type: "previsit_reminder",
      priority: "normal",
      title: content.title,
      body: content.body,
      href: content.href,
    },
    select: { id: true },
  });
  return { outcome: "sent", meta: { notificationId: note.id } };
}

export async function sendDueVisitReminders(
  input: SendDueVisitRemindersInput,
): Promise<SendDueVisitRemindersResult> {
  const appointment = await sendDueAppointmentReminders(input);
  const portal = normalizePrevisitPortalOrigin(input.portalUrl);

  if (!portal.ok) {
    return {
      appointment,
      previsit: null,
      previsitSkippedReason: portal.reason,
    };
  }

  const previsit = await sendDuePrevisitCompletionReminders({
    now: input.now,
    portalUrl: portal.portalUrl,
  });

  return { appointment, previsit };
}

function normalizePrevisitPortalOrigin(
  portalUrl: string | null | undefined,
):
  | { ok: true; portalUrl: string }
  | { ok: false; reason: PrevisitReminderSkippedReason } {
  const trimmed = portalUrl?.trim();
  if (!trimmed) return { ok: false, reason: "portal-url-missing" };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, reason: "portal-url-invalid" };
  }

  const hasExtras =
    (parsed.pathname && parsed.pathname !== "/") ||
    parsed.search !== "" ||
    parsed.hash !== "";
  if (parsed.protocol !== "https:" || hasExtras) {
    return { ok: false, reason: "portal-url-invalid" };
  }

  return { ok: true, portalUrl: parsed.origin };
}

async function alreadySentPrevisit(
  appointmentId: string,
  milestone: PrevisitMilestone,
  channel: PrevisitChannel,
): Promise<boolean> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: PREVISIT_COMPLETION_REMINDER_ACTION,
      subjectType: "Appointment",
      subjectId: appointmentId,
    },
    select: { metadata: true },
    take: 20,
  });
  return rows.some((r) => {
    const meta = r.metadata as { milestone?: string; channel?: string } | null;
    if (meta?.milestone !== milestone) return false;
    // Channel-aware. Legacy rows predate the channel field and were all SMS, so
    // treat a channel-less row as having satisfied the SMS channel — avoids a
    // one-time re-send of SMS nudges already delivered before this change.
    if (meta.channel === channel) return true;
    return channel === "sms" && meta.channel === undefined;
  });
}
