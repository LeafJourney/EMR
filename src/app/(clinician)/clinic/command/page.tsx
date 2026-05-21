import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { CommandLayout } from "./command-layout";
import { ClinicalFlowTile } from "@/components/command/clinical-flow-tile";
import { ClinicalDiscoveryTile } from "@/components/command/clinical-discovery-tile";
import { PatientImpactTile } from "@/components/command/patient-impact-tile";
import { Tile } from "@/components/ui/tile";
import { Sparkline } from "@/components/ui/sparkline";
import { prisma } from "@/lib/db/prisma";

export const metadata = { title: "Command Center" };

export default async function CommandCenterPage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  const today = new Date();
  const startOfDay = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate()
  );
  const endOfDay = new Date(startOfDay.getTime() + 86_400_000);
  const startOfWeek = new Date(startOfDay);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());

  const [weekVisits, weekFinalizedNotes, dailyEncounterCounts] = await Promise.all([
    prisma.encounter.count({
      where: {
        organizationId,
        scheduledFor: { gte: startOfWeek, lt: endOfDay },
      },
    }),
    prisma.note.count({
      where: {
        status: "finalized",
        finalizedAt: { gte: startOfWeek },
        encounter: { organizationId },
      },
    }),
    Promise.all(
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(startOfDay);
        d.setDate(d.getDate() - (6 - i));
        const next = new Date(d.getTime() + 86_400_000);
        return prisma.encounter.count({
          where: {
            organizationId,
            scheduledFor: { gte: d, lt: next },
          },
        });
      })
    ),
  ]);

  const greeting = pickGreeting(today.getHours());

  return (
    <PageShell maxWidth="max-w-[1400px]">
      <PageHeader
        eyebrow="Command Center"
        title={`${greeting}, ${user.firstName}.`}
        description="Your day at a glance — what's happening, what you uncovered, and where you're needed next."
      />

      <CommandLayout>
        {/* Tile 1: This Week's Visits */}
        <Tile eyebrow="Visits" title="This Week's Visits" icon="📊" span="1x1">
          <div className="flex flex-col justify-center h-full pb-4">
            <span className="text-4xl font-extrabold tracking-tight text-text tabular-nums">
              {weekVisits}
            </span>
            <span className="text-xs text-text-muted mt-1">Total scheduled visits</span>
          </div>
        </Tile>

        {/* Tile 2: Finalized Notes */}
        <Tile eyebrow="Documentation" title="Finalized Notes" icon="✍️" span="1x1">
          <div className="flex flex-col justify-center h-full pb-4">
            <span className="text-4xl font-extrabold tracking-tight text-text tabular-nums">
              {weekFinalizedNotes}
            </span>
            <span className="text-xs text-text-muted mt-1">Finalized this week</span>
          </div>
        </Tile>

        {/* Tile 3: Visit Volume Trend */}
        <Tile eyebrow="Analytics" title="Visits — Last 7 Days" icon="📈" span="1x1">
          <div className="flex flex-col justify-end h-full pb-2">
            <Sparkline
              data={dailyEncounterCounts}
              width={280}
              height={64}
              color="var(--accent)"
              fill="var(--accent-soft)"
            />
          </div>
        </Tile>

        <ClinicalFlowTile user={user} />
        <ClinicalDiscoveryTile user={user} />
        <PatientImpactTile user={user} />
      </CommandLayout>
    </PageShell>
  );
}

function pickGreeting(hour: number): string {
  if (hour < 5) return "Still up";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  if (hour < 21) return "Good evening";
  return "Good night";
}
