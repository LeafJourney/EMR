import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { CuresCredentialsForm } from "./cures-credentials-form";
import { ReminderPreferencesForm } from "./reminder-preferences-form";
import { loadReminderPrefs } from "./reminder-actions";
import { loadSchedulingPrefs } from "./scheduling-prefs-actions";
import {
  BurnoutGuardrailsForm,
  type SerializedDayLoad,
} from "./burnout-guardrails-form";

export const metadata = { title: "Provider settings" };

/**
 * EMR-889 / EMR-211 / EMR-214 — Provider settings.
 *
 * Hosts the CURES (PDMP) opt-in, multi-channel reminder preferences (EMR-211),
 * and the burnout guardrails + live burnout index (EMR-214). The burnout index
 * is computed from the signed-in provider's actual last-14-day appointment load.
 *
 * NOTE (intentional scope guard): the bottom-left provider-initials menu in the
 * shared clinic layout is the natural entry point; wiring that nav link would
 * require editing the shared clinic layout, deliberately left to a follow-up.
 */
export default async function ClinicSettingsPage() {
  const user = await requireUser();
  const providerName = `${user.firstName} ${user.lastName}`.trim() || "Provider";
  const organizationId = user.organizationId!;

  // EMR-211 / EMR-214 — load reminder + scheduling prefs from the per-user
  // communication profile (both persisted server-side, no schema change).
  const reminderPrefs = await loadReminderPrefs(user.id);
  const schedulingPrefs = await loadSchedulingPrefs(user.id);

  // EMR-214 — load the provider's last-14-day appointment load for the index.
  const provider = await prisma.provider.findFirst({
    where: { userId: user.id, organizationId },
    select: { id: true },
  });

  let fortnight: SerializedDayLoad[] = [];
  if (provider) {
    const start = startOfDay(addDays(new Date(), -13));
    const appts = await prisma.appointment.findMany({
      where: {
        providerId: provider.id,
        startAt: { gte: start },
        status: { notIn: ["cancelled"] },
      },
      select: { startAt: true, endAt: true },
    });
    fortnight = buildFortnight(start, appts);
  }

  return (
    <PageShell maxWidth="max-w-[720px]">
      <PageHeader
        eyebrow="Settings"
        title="Provider settings"
        description={`Signed in as ${providerName}. Manage your scheduling and prescribing preferences below.`}
      />
      <div className="space-y-6">
        <ReminderPreferencesForm initialPrefs={reminderPrefs} />
        {provider && (
          <BurnoutGuardrailsForm
            providerId={provider.id}
            fortnight={fortnight}
            initialPrefs={schedulingPrefs}
          />
        )}
        <CuresCredentialsForm userId={user.id} />
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// EMR-214 — build the 14-day DayLoad fortnight from raw appointment rows.
// ---------------------------------------------------------------------------

function startOfDay(d: Date): Date {
  const n = new Date(d);
  n.setHours(0, 0, 0, 0);
  return n;
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setDate(n.getDate() + days);
  return n;
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function buildFortnight(
  start: Date,
  appts: Array<{ startAt: Date; endAt: Date }>,
): SerializedDayLoad[] {
  return Array.from({ length: 14 }, (_, i) => {
    const day = addDays(start, i);
    const dayAppts = appts.filter((a) => sameDay(a.startAt, day));
    const durationsMin = dayAppts.map(
      (a) => Math.max(0, (a.endAt.getTime() - a.startAt.getTime()) / 60_000),
    );
    const avgDurationMin =
      durationsMin.length > 0
        ? durationsMin.reduce((s, m) => s + m, 0) / durationsMin.length
        : 0;
    const latestStartHour = dayAppts.reduce(
      (max, a) => Math.max(max, a.startAt.getHours()),
      0,
    );
    const totalDocumentedHours =
      durationsMin.reduce((s, m) => s + m, 0) / 60;
    return {
      day: day.toISOString(),
      scheduledVisits: dayAppts.length,
      // High-intensity tagging not yet derived from visit type — see form note.
      highIntensityVisits: 0,
      avgDurationMin,
      latestStartHour,
      totalDocumentedHours,
    };
  });
}
