import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  SlotRecommenderPanel,
  type SerializedCandidate,
} from "./slot-recommender-panel";

export const metadata = { title: "Slot recommender" };

/**
 * EMR-209 — Smart slot recommender.
 *
 * Loads the clinic's open slots across active providers (synthetic 14-day
 * grid minus booked, same source the booking funnel uses) with a computed
 * slot-value, then hands them to the recommender panel which ranks them
 * against an operator-tuned patient context.
 *
 * Reachable at /clinic/scheduling/recommend. Layout-nav link deferred to keep
 * shared layout files untouched (see provider settings page note).
 */
export default async function SlotRecommenderPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const providers = await prisma.provider.findMany({
    where: { organizationId: orgId, active: true },
    include: { user: { select: { firstName: true, lastName: true } } },
    orderBy: { createdAt: "asc" },
  });

  const horizonStart = new Date();
  horizonStart.setHours(0, 0, 0, 0);
  const horizonEnd = new Date(horizonStart);
  horizonEnd.setDate(horizonEnd.getDate() + 14);

  const booked = await prisma.appointment.findMany({
    where: {
      patient: { organizationId: orgId },
      startAt: { gte: horizonStart, lt: horizonEnd },
      status: { in: ["requested", "confirmed"] },
    },
    select: { providerId: true, startAt: true },
  });
  const bookedKeys = new Set(
    booked
      .filter((b) => b.providerId)
      .map((b) => `${b.providerId}|${b.startAt.toISOString()}`),
  );

  const providerList = providers.map((p) => ({
    id: p.id,
    name: `${p.user.firstName} ${p.user.lastName}`.trim() || "Provider",
  }));

  const candidates = buildCandidates(providerList, horizonStart, bookedKeys);

  return (
    <PageShell maxWidth="max-w-[920px]">
      <PageHeader
        eyebrow="Scheduling"
        title="Smart slot recommender"
        description="Open slots ranked for a patient by continuity, no-show fit, and preferences."
      />
      <SlotRecommenderPanel candidates={candidates} providers={providerList} />
    </PageShell>
  );
}

/**
 * Build candidate slots from a synthetic 14-day grid (weekdays, 9a–5p, 30-min),
 * masking booked starts and capping the payload. `slotValue` (0..1) reflects
 * how much the clinic loses if the slot no-shows: prime midday weekday > early
 * or late or Friday slots.
 */
function buildCandidates(
  providers: { id: string; name: string }[],
  start: Date,
  bookedKeys: Set<string>,
): SerializedCandidate[] {
  const out: SerializedCandidate[] = [];
  const PER_PROVIDER_CAP = 30;

  for (const provider of providers) {
    let count = 0;
    for (let d = 0; d < 14 && count < PER_PROVIDER_CAP; d++) {
      const day = new Date(start);
      day.setDate(day.getDate() + d);
      const dow = day.getDay();
      if (dow === 0 || dow === 6) continue; // weekdays only in the synthetic grid
      for (let hour = 9; hour < 17 && count < PER_PROVIDER_CAP; hour++) {
        for (const minute of [0, 30]) {
          const slot = new Date(day);
          slot.setHours(hour, minute, 0, 0);
          if (slot.getTime() <= Date.now()) continue;
          const iso = slot.toISOString();
          if (bookedKeys.has(`${provider.id}|${iso}`)) continue;
          const end = new Date(slot.getTime() + 30 * 60_000);
          out.push({
            slotId: `${provider.id}|${iso}`,
            providerId: provider.id,
            providerName: provider.name,
            startAt: iso,
            endAt: end.toISOString(),
            modality: "video",
            slotValue: slotValueFor(hour, dow),
          });
          count++;
        }
      }
    }
  }
  return out;
}

function slotValueFor(hour: number, dayOfWeek: number): number {
  let v = 0.5;
  if (hour >= 10 && hour < 14) v += 0.2; // prime midday
  if (dayOfWeek >= 2 && dayOfWeek <= 4) v += 0.15; // Tue–Thu
  if (hour < 9 || hour >= 16) v -= 0.15; // early / late
  if (dayOfWeek === 5) v -= 0.1; // Friday drift
  return Math.max(0, Math.min(1, Math.round(v * 100) / 100));
}
