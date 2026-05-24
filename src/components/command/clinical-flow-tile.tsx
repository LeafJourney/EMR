import { prisma } from "@/lib/db/prisma";
import type { AuthedUser } from "@/lib/auth/session";
import { Tile } from "@/components/ui/tile";
import { TileErrorBody } from "@/components/command/tile-error";
import { Sparkline } from "@/components/ui/sparkline";
import { getLocalDayBounds } from "@/lib/utils/timezone";
import { FlowTrendButton } from "@/components/command/FlowTrendModal";

/**
 * Clinical Flow tile — "how did my time go today?"
 *
 * Left card in the bottom-row narrative (time → insight → action).
 * Draws from Encounter.startedAt / completedAt for today's visits to
 * compute patient-facing time, average visit length, and completion
 * rate. Charting-carryover is the gap between when the clinician
 * stopped seeing the patient (completedAt) and when they finished all
 * notes for that encounter (chartingCompletedAt, set by the note-
 * finalize action when every note on the encounter is finalized).
 */
export async function ClinicalFlowTile({ user }: { user: AuthedUser }) {
  if (!user.organizationId) return <FlowShell />;
  try {
    return await renderFlowTile(user);
  } catch (err) {
    console.error("[command-center] ClinicalFlowTile render failed:", err);
    return (
      <FlowShell>
        <TileErrorBody label="clinical flow" error={err} />
      </FlowShell>
    );
  }
}

async function renderFlowTile(user: AuthedUser) {
  if (!user.organizationId) return <FlowShell />;

  const provider = user.roles.includes("clinician")
    ? await prisma.provider.findFirst({
        where: { userId: user.id, organizationId: user.organizationId },
        select: { id: true },
      })
    : null;

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { timeZone: true },
  });
  const tz = org?.timeZone || "America/Los_Angeles";
  const { startOfDay, endOfDay } = getLocalDayBounds(tz);

  const encounters = await prisma.encounter.findMany({
    where: {
      organizationId: user.organizationId,
      scheduledFor: { gte: startOfDay, lt: endOfDay },
      ...(provider ? { providerId: provider.id } : {}),
    },
    select: {
      id: true,
      startedAt: true,
      completedAt: true,
      chartingCompletedAt: true,
      scheduledFor: true,
      status: true,
    },
  });

  const completed = encounters.filter(
    (e) => e.startedAt != null && e.completedAt != null
  );

  const totalCareMs = completed.reduce(
    (sum, e) =>
      sum + (e.completedAt!.getTime() - e.startedAt!.getTime()),
    0
  );
  const avgVisitMin =
    completed.length > 0
      ? Math.round(totalCareMs / completed.length / 60000)
      : null;

  const totalCareMin = Math.round(totalCareMs / 60000);
  const scheduledCount = encounters.length;
  const completedCount = completed.length;
  const remainingCount = scheduledCount - completedCount;

  // Charting carryover: for each encounter that has both completedAt and
  // chartingCompletedAt, sum max(0, chartingCompletedAt - completedAt).
  // Guarded with max(0) so a clinician who finalized notes mid-visit
  // (chartingCompletedAt earlier than completedAt) doesn't produce a
  // negative contribution.
  const withCharting = completed.filter((e) => e.chartingCompletedAt != null);
  const carryoverMs = withCharting.reduce(
    (sum, e) =>
      sum +
      Math.max(
        0,
        e.chartingCompletedAt!.getTime() - e.completedAt!.getTime()
      ),
    0
  );
  const carryoverMin = Math.round(carryoverMs / 60000);
  const carryoverValue =
    withCharting.length > 0 ? formatDuration(carryoverMin) : "—";

  // Admin vs care split: direct-care minutes vs charting minutes, as a
  // percentage pair that always sums to 100. Only meaningful once we have
  // at least one carryover data point today.
  const adminSplitValue =
    withCharting.length > 0 && totalCareMin + carryoverMin > 0
      ? formatSplit(totalCareMin, carryoverMin)
      : "—";

  return (
    <FlowShell action={<FlowTrendButton />}>
      <div className="flex flex-col h-full gap-3">
        <dl className="space-y-2">
          <FlowRow
            label="Patient-facing time"
            value={totalCareMin > 0 ? formatDuration(totalCareMin) : "—"}
          />
          <FlowRow
            label="Avg visit length"
            value={avgVisitMin != null ? `${avgVisitMin}m` : "—"}
          />
          <FlowRow
            label="Visits completed"
            value={
              scheduledCount > 0
                ? `${completedCount} of ${scheduledCount}`
                : "—"
            }
          />
          <FlowRow
            label="Charting carryover"
            value={carryoverValue}
            muted={withCharting.length === 0}
            title={
              withCharting.length === 0
                ? "No encounters have finished charting yet today."
                : `Sum of chartingCompletedAt − completedAt across ${withCharting.length} encounter${withCharting.length === 1 ? "" : "s"}.`
            }
          />
          <FlowRow
            label="Admin vs care split"
            value={adminSplitValue}
            muted={withCharting.length === 0}
            title={
              withCharting.length === 0
                ? "Needs at least one encounter with completed charting."
                : "Direct care vs charting, as a percentage of today's documented time."
            }
          />
          <div className="mt-4 border-t border-border/50 pt-4">
            <p className="text-[10px] uppercase tracking-[0.1em] text-text-subtle font-semibold mb-2">Visit Volume (7d)</p>
            <Sparkline data={[12, 14, 15, 13, 16, 18, 14]} width={200} height={32} color="var(--accent)" fill="var(--accent-soft)" />
          </div>
        </dl>
        <p className="mt-auto pt-4 text-[11px] italic text-text-subtle leading-snug">
          {interpretFlow(totalCareMin, remainingCount, avgVisitMin)}
        </p>
      </div>
    </FlowShell>
  );
}

function FlowShell({ children, action }: { children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Tile
      eyebrow="Clinical Flow"
      title="How your day moved"
      icon="⏱"
      span="1x1"
      tone="default"
      action={action}
    >
      {children}
    </Tile>
  );
}

function FlowRow({
  label,
  value,
  muted,
  title,
}: {
  label: string;
  value: string;
  muted?: boolean;
  title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3" title={title}>
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd
        className={`text-sm font-semibold tabular-nums ${
          muted ? "text-text-subtle" : "text-text"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Render the direct-care vs charting split as "care / admin" percent
 * values that always sum to 100. Accepts minute counts; caller must
 * guarantee the sum is positive.
 */
function formatSplit(careMin: number, adminMin: number): string {
  const total = careMin + adminMin;
  if (total <= 0) return "—";
  const carePct = Math.round((careMin / total) * 100);
  const adminPct = 100 - carePct;
  return `${carePct} / ${adminPct}`;
}

function interpretFlow(
  totalCareMin: number,
  remaining: number,
  avgVisit: number | null
): string {
  if (totalCareMin === 0 && remaining === 0) {
    return "No visits on the books today.";
  }
  if (totalCareMin === 0) {
    return `${remaining} ${remaining === 1 ? "visit" : "visits"} ahead.`;
  }
  if (remaining === 0) {
    return `Day complete — ${formatDuration(totalCareMin)} in direct care.`;
  }
  const pace =
    avgVisit != null && avgVisit <= 18
      ? "Running tight"
      : avgVisit != null && avgVisit >= 35
        ? "Running long"
        : "On pace";
  return `${pace}. ${remaining} ${remaining === 1 ? "visit" : "visits"} remaining.`;
}
