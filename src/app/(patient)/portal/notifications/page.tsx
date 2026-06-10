import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import {
  NOTIFICATION_CONFIG,
  getDefaultPreferences,
  type Notification,
  type NotificationChannel,
  type NotificationPreference,
  type NotificationPriority,
  type NotificationType,
} from "@/lib/domain/notifications";
import { NotificationCenter } from "./notification-center";

export const metadata = { title: "Notifications" };

// The Notification.type column is a free string — rows written by other
// surfaces (e.g. the pre-visit reminder scheduler) use ids outside the
// portal's display union. Alias the known ones, fall back to "system".
const TYPE_ALIASES: Record<string, NotificationType> = {
  previsit_reminder: "appointment_reminder",
  appointment_created: "appointment_reminder",
  appointment_confirmed: "appointment_reminder",
  appointment_cancelled: "appointment_reminder",
  appointment_rescheduled: "appointment_reminder",
  message: "message_received",
  refill_update: "prescription_ready",
};

function coerceType(type: string): NotificationType {
  if (type in NOTIFICATION_CONFIG) return type as NotificationType;
  return TYPE_ALIASES[type] ?? "system";
}

function coercePriority(priority: string): NotificationPriority {
  return priority === "urgent" || priority === "low" ? priority : "normal";
}

function hydratePreferences(preferencesJson: unknown): NotificationPreference[] {
  const defaults = getDefaultPreferences();
  if (!preferencesJson || typeof preferencesJson !== "object") return defaults;
  const saved = (preferencesJson as Record<string, unknown>).notificationTypes;
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) return defaults;

  const savedMap = saved as Record<
    string,
    { enabled?: unknown; channels?: unknown }
  >;
  return defaults.map((pref) => {
    const row = savedMap[pref.type];
    if (!row || typeof row !== "object") return pref;
    const channels = Array.isArray(row.channels)
      ? (row.channels.filter((c) =>
          ["in_app", "email", "sms"].includes(c as string),
        ) as NotificationChannel[])
      : pref.channels;
    return {
      ...pref,
      enabled: typeof row.enabled === "boolean" ? row.enabled : pref.enabled,
      channels,
    };
  });
}

export default async function NotificationsPage() {
  const user = await requireRole("patient");

  const [rows, prefRow] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.communicationPreference.findUnique({
      where: { userId: user.id },
      select: { preferences: true },
    }),
  ]);

  const notifications: Notification[] = rows.map((row) => ({
    id: row.id,
    userId: row.userId,
    type: coerceType(row.type),
    priority: coercePriority(row.priority),
    title: row.title,
    body: row.body,
    href: row.href ?? undefined,
    read: row.read,
    readAt: row.readAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    metadata: (row.metadata as Record<string, unknown> | null) ?? undefined,
  }));

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PageHeader
        eyebrow="Notifications"
        title="Your notifications"
        description="Stay on top of messages, reminders, and updates from your care team."
      />
      <PatientSectionNav section="account" />
      <NotificationCenter
        initialNotifications={notifications}
        initialPreferences={hydratePreferences(prefRow?.preferences)}
      />
    </PageShell>
  );
}
