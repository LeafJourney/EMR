import { prisma } from "@/lib/db/prisma";
import type { AuthedUser } from "@/lib/auth/session";
import { Tile } from "@/components/ui/tile";
import { TileErrorBody } from "@/components/command/tile-error";
import { getLocalDayBounds } from "@/lib/utils/timezone";
import { DiscoveryTrendButton } from "@/components/command/DiscoveryTrendModal";

/**
 * Clinical Discovery tile — "what did I uncover today?"
 *
 * Middle card in the bottom-row narrative (time → insight → action).
 * Aggregates today's ClinicalObservations by category. This is also
 * the surface the ambient physician-assistant agent will populate
 * as it runs interaction checks, contraindication scans, and trend
 * flags in the background — every observation the fleet records
 * shows up here as the day progresses.
 */
export async function ClinicalDiscoveryTile({ user }: { user: AuthedUser }) {
  if (!user.organizationId) return <DiscoveryShell />;
  try {
    return await renderDiscoveryTile(user.organizationId);
  } catch (err) {
    console.error("[command-center] ClinicalDiscoveryTile render failed:", err);
    return (
      <DiscoveryShell>
        <TileErrorBody label="clinical discovery" error={err} />
      </DiscoveryShell>
    );
  }
}

async function renderDiscoveryTile(organizationId: string) {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { timeZone: true },
  });
  const tz = org?.timeZone || "America/Los_Angeles";
  const { startOfDay, endOfDay } = getLocalDayBounds(tz);

  const observations = await prisma.clinicalObservation.findMany({
    where: {
      patient: { organizationId, deletedAt: null },
      createdAt: { gte: startOfDay, lt: endOfDay },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      patientId: true,
      category: true,
      severity: true,
      summary: true,
      actionSuggested: true,
      acknowledgedAt: true,
      patient: { select: { firstName: true, lastName: true } },
    },
  });

  const total = observations.length;
  const richVisits = new Set(observations.map((o) => o.patientId)).size;

  const noteworthy = observations.filter(
    (o) => o.severity === "notable" || o.severity === "concern" || o.severity === "urgent"
  );
  const careGaps = noteworthy.filter(
    (o) => o.category === "red_flag" || o.category === "adherence"
  ).length;
  const medFlags = noteworthy.filter(
    (o) => o.category === "side_effect" || o.category === "medication_response"
  ).length;
  const diagnostic = noteworthy.filter(
    (o) => o.category === "symptom_trend" || o.category === "emotional_state"
  ).length;

  // Highest-yield signal: unacknowledged + highest severity + most recent.
  const severityRank: Record<string, number> = {
    urgent: 0,
    concern: 1,
    notable: 2,
    info: 3,
  };
  const topSignal = [...observations]
    .filter((o) => !o.acknowledgedAt)
    .sort(
      (a, b) =>
        (severityRank[a.severity] ?? 9) - (severityRank[b.severity] ?? 9)
    )[0];

  return (
    <DiscoveryShell action={<DiscoveryTrendButton />}>
      <div className="flex flex-col h-full gap-3">
        <dl className="space-y-2">
          <DiscoveryRow
            label="Signals surfaced"
            value={total > 0 ? String(total) : "—"}
          />
          <DiscoveryRow
            label="Discovery-rich visits"
            value={richVisits > 0 ? String(richVisits) : "—"}
          />
          <DiscoveryRow
            label="Care gaps"
            value={careGaps > 0 ? String(careGaps) : "—"}
          />
          <DiscoveryRow
            label="Medication flags"
            value={medFlags > 0 ? String(medFlags) : "—"}
            tone={medFlags > 0 ? "warn" : "default"}
          />
          <DiscoveryRow
            label="Diagnostic signal"
            value={diagnostic > 0 ? String(diagnostic) : "—"}
          />
        </dl>
        <div className="mt-auto">
          {topSignal ? (
            <div className="rounded-lg bg-surface-muted/60 px-3 py-2 border border-border/50">
              <p className="text-[11px] uppercase tracking-[0.1em] text-text-subtle font-semibold">
                Top signal
              </p>
              <p className="text-xs text-text mt-1 leading-snug line-clamp-2">
                <span className="font-semibold">
                  {topSignal.patient.firstName} {topSignal.patient.lastName[0]}.
                </span>{" "}
                {topSignal.summary}
              </p>
            </div>
          ) : (
            <p className="text-[11px] italic text-text-subtle leading-snug">
              Signals will land here as the day unfolds.
            </p>
          )}
        </div>
      </div>
    </DiscoveryShell>
  );
}

function DiscoveryShell({ children, action }: { children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Tile
      eyebrow="Clinical Discovery"
      title="What you uncovered"
      icon="🔍"
      span="1x1"
      tone="default"
      action={action}
    >
      {children}
    </Tile>
  );
}

function DiscoveryRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn";
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd
        className={`text-sm font-semibold tabular-nums ${
          tone === "warn" ? "text-amber-700" : "text-text"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
