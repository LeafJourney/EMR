import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import type { Agent } from "@/lib/orchestration/types";
import { writeAgentAudit } from "@/lib/orchestration/context";
import { DEFAULT_TIME_ZONE } from "@/lib/utils/timezone";

// ---------------------------------------------------------------------------
// Appointment Lifecycle Agent — EMR-1115 (PJ-3 / PJ-B4)
// ---------------------------------------------------------------------------
// Consumes `appointment.created` / `appointment.cancelled` (emitted by BOTH
// the patient portal booking actions and the clinic-side scheduling actions)
// and closes the "clinic never speaks first" loop:
//
//   1. a portal Notification row for the patient (same create shape as the
//      pre-visit reminder writer in src/lib/scheduling/send-reminders.ts), and
//   2. a patient-visible portal Message in their care-team thread
//      (status "sent" — deterministic template copy, never an LLM draft, so
//      the workflow runs without approval).
//
// Cancellation reason: the clinic cancel action records the reason only on
// its AuditLog row, so when the event doesn't carry one we copy it out of the
// latest `appointment.cancelled` audit entry into the cancellation message —
// that's where the patient learns why (PJ minor #4).
//
// Idempotent per appointment+type: a `appointment.lifecycle.notified` audit
// row with the same type short-circuits re-delivery (same pattern as the
// appointment-reminder agent's per-type SMS dedupe).
// ---------------------------------------------------------------------------

const AGENT_NAME = "appointmentLifecycle";
const AGENT_VERSION = "1.0.0";
export const LIFECYCLE_NOTIFIED_ACTION = "appointment.lifecycle.notified";

const input = z.object({
  appointmentId: z.string(),
  type: z.enum(["created", "cancelled"]),
  reason: z.string().nullable().optional(),
  source: z.enum(["patient", "staff"]).nullable().optional(),
});

const output = z.object({
  skipped: z.boolean(),
  notificationId: z.string().nullable(),
  messageId: z.string().nullable(),
});

export type AppointmentLifecycleInput = z.infer<typeof input>;

function formatWhen(startAt: Date, timeZone: string): string {
  try {
    return startAt.toLocaleString("en-US", {
      timeZone,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return startAt.toISOString();
  }
}

function modalityLabel(modality: string): string {
  if (modality === "video") return "video visit";
  if (modality === "phone") return "phone visit";
  return "in-person visit";
}

export interface LifecycleCopyArgs {
  type: "created" | "cancelled";
  patientFirstName: string;
  providerName: string | null;
  startAt: Date;
  modality: string;
  timeZone: string;
  reason: string | null;
}

/** Deterministic patient-facing copy. Exported for unit tests. */
export function buildLifecycleCopy(args: LifecycleCopyArgs): {
  notificationTitle: string;
  notificationBody: string;
  messageBody: string;
} {
  const when = formatWhen(args.startAt, args.timeZone);
  const visit = modalityLabel(args.modality);
  const withProvider = args.providerName ? ` with ${args.providerName}` : "";

  if (args.type === "created") {
    const body = `Your ${visit}${withProvider} is booked for ${when}. You can review or reschedule it any time in your portal.`;
    return {
      notificationTitle: "Appointment confirmed",
      notificationBody: body,
      messageBody: `Hi ${args.patientFirstName} — this confirms your ${visit}${withProvider} on ${when}. If anything changes, you can reschedule or cancel from the Appointments page. See you then!`,
    };
  }

  const reasonLine = args.reason ? ` Reason: ${args.reason}.` : "";
  const body = `Your ${visit}${withProvider} on ${when} has been cancelled.${reasonLine}`;
  return {
    notificationTitle: "Appointment cancelled",
    notificationBody: body,
    messageBody: `Hi ${args.patientFirstName} — your ${visit}${withProvider} scheduled for ${when} has been cancelled.${reasonLine} If you'd like a new time, you can book one from the Appointments page or just reply here and we'll help.`,
  };
}

/** Per appointment+type dedupe via the agent's own audit trail. */
async function alreadyNotified(
  appointmentId: string,
  type: "created" | "cancelled",
): Promise<boolean> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: LIFECYCLE_NOTIFIED_ACTION,
      subjectType: "Appointment",
      subjectId: appointmentId,
    },
    select: { metadata: true },
    take: 10,
  });
  return rows.some((r) => {
    const meta = r.metadata as { type?: string } | null;
    return meta?.type === type;
  });
}

/**
 * The clinic cancel action keeps the cancellation reason in AuditLog metadata
 * only (Appointment has no reason column). Copy it out so the patient-facing
 * message can carry it.
 */
async function lookupCancellationReason(appointmentId: string): Promise<string | null> {
  const rows = await prisma.auditLog.findMany({
    where: {
      action: "appointment.cancelled",
      subjectType: "Appointment",
      subjectId: appointmentId,
    },
    orderBy: { createdAt: "desc" },
    select: { metadata: true },
    take: 5,
  });
  for (const row of rows) {
    const meta = row.metadata as { reason?: unknown } | null;
    if (typeof meta?.reason === "string" && meta.reason.trim()) {
      return meta.reason.trim();
    }
  }
  return null;
}

export const appointmentLifecycleAgent: Agent<
  z.infer<typeof input>,
  z.infer<typeof output>
> = {
  name: AGENT_NAME,
  version: AGENT_VERSION,
  description:
    "Delivers booking confirmations and cancellation notices to the patient " +
    "as a portal Notification + a care-team Message. Idempotent per " +
    "appointment+type; deterministic copy, no approval gate.",
  inputSchema: input,
  outputSchema: output,
  allowedActions: ["read.patient", "write.message.draft"],
  requiresApproval: false,

  async run({ appointmentId, type, reason, source }, ctx) {
    ctx.assertCan("read.patient");

    if (await alreadyNotified(appointmentId, type)) {
      ctx.log("info", "Lifecycle notice already delivered — skipping", {
        appointmentId,
        type,
      });
      return { skipped: true, notificationId: null, messageId: null };
    }

    const appointment = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: {
          select: {
            id: true,
            userId: true,
            firstName: true,
            organizationId: true,
            organization: { select: { timeZone: true } },
          },
        },
        provider: {
          select: {
            title: true,
            user: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });
    if (!appointment) throw new Error(`Appointment not found: ${appointmentId}`);

    const patient = appointment.patient;
    const providerName = appointment.provider?.user
      ? `${appointment.provider.title ?? ""} ${appointment.provider.user.firstName ?? ""} ${appointment.provider.user.lastName ?? ""}`
          .replace(/\s+/g, " ")
          .trim() || null
      : null;

    const resolvedReason =
      type === "cancelled"
        ? (reason?.trim() || (await lookupCancellationReason(appointmentId)))
        : null;

    const copy = buildLifecycleCopy({
      type,
      patientFirstName: patient.firstName,
      providerName,
      startAt: appointment.startAt,
      modality: appointment.modality,
      timeZone: patient.organization?.timeZone || DEFAULT_TIME_ZONE,
      reason: resolvedReason,
    });

    // ── 1. Portal Notification (send-reminders.ts in-app create shape) ──
    let notificationId: string | null = null;
    if (patient.userId) {
      const note = await prisma.notification.create({
        data: {
          userId: patient.userId,
          type: type === "created" ? "appointment_confirmed" : "appointment_cancelled",
          priority: "normal",
          title: copy.notificationTitle,
          body: copy.notificationBody,
          href: "/portal/appointments",
        },
        select: { id: true },
      });
      notificationId = note.id;
    } else {
      ctx.log("info", "Patient has no portal account — notification skipped", {
        appointmentId,
      });
    }

    // ── 2. Patient-visible portal Message (status "sent", clinic-side
    //       authorship: senderUserId null + senderAgent, like approved
    //       care-team replies the portal already renders) ──
    ctx.assertCan("write.message.draft");
    const thread = await prisma.messageThread.findFirst({
      where: { patientId: patient.id },
      orderBy: { lastMessageAt: "desc" },
    });
    const now = new Date();
    const threadId =
      thread?.id ??
      (
        await prisma.messageThread.create({
          data: { patientId: patient.id, subject: "Care team" },
        })
      ).id;

    const message = await prisma.message.create({
      data: {
        threadId,
        body: copy.messageBody,
        senderAgent: `${AGENT_NAME}:${AGENT_VERSION}`,
        aiDrafted: false,
        status: "sent",
        channel: "portal",
        delivery: "delivered",
        sentAt: now,
      },
      select: { id: true },
    });
    await prisma.messageThread.update({
      where: { id: threadId },
      data: { lastMessageAt: now },
    });

    await writeAgentAudit(
      AGENT_NAME,
      AGENT_VERSION,
      patient.organizationId,
      LIFECYCLE_NOTIFIED_ACTION,
      { type: "Appointment", id: appointmentId },
      {
        type,
        source: source ?? null,
        notificationId,
        messageId: message.id,
        hasReason: !!resolvedReason,
      },
    );

    ctx.log("info", "Appointment lifecycle notice delivered", {
      appointmentId,
      type,
      notificationId,
      messageId: message.id,
    });

    return { skipped: false, notificationId, messageId: message.id };
  },
};
