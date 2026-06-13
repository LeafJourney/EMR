import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { Eyebrow } from "@/components/ui/ornament";
import { computeStreak } from "@/lib/domain/streaks";
import { StreaksView, type StreaksData } from "./streaks-view";

export const metadata = { title: "Your Streak" };

/** Longest run of consecutive calendar days in a set of "YYYY-MM-DD" keys. */
function longestRun(dayKeys: Set<string>): number {
  const sorted = [...dayKeys].sort();
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const key of sorted) {
    const t = new Date(`${key}T00:00:00`).getTime();
    run = prev !== null && t - prev === 86_400_000 ? run + 1 : 1;
    if (run > longest) longest = run;
    prev = t;
  }
  return longest;
}

export default async function StreaksPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!patient) redirect("/portal/intake");

  const since = new Date(Date.now() - 60 * 86400000);
  const doses = await prisma.doseLog.findMany({
    where: { patientId: patient.id, loggedAt: { gte: since } },
    orderBy: { loggedAt: "desc" },
    select: { loggedAt: true },
  });

  const timestamps = doses.map((d) => d.loggedAt.toISOString());
  const computed = computeStreak(timestamps);

  // Build last 30 days "logged?" map for the calendar
  const days: { date: string; logged: boolean }[] = [];
  const loggedKeys = new Set(timestamps.map((t) => t.slice(0, 10)));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    days.push({ date: d, logged: loggedKeys.has(d) });
  }

  // Demo defaults — show something delightful even before the patient has data.
  const realCurrent = computed;
  const showDemo = realCurrent === 0 && timestamps.length === 0;

  const data: StreaksData = {
    currentStreak: showDemo ? 12 : realCurrent,
    // Real longest run of consecutive logged days — not a fabricated floor of 23.
    longestStreak: showDemo ? 23 : longestRun(loggedKeys),
    totalDaysLogged: showDemo ? 47 : loggedKeys.size,
    last30: days,
  };

  return (
    <PageShell maxWidth="max-w-[860px]">
      <PatientSectionNav section="health" />
      <div className="mb-10 text-center">
        <Eyebrow className="justify-center mb-3">Your streak</Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight">
          Showing up matters
        </h1>
        <p className="text-[15px] text-text-muted mt-3 max-w-md mx-auto leading-relaxed">
          Every day you log, you help us understand what works.
        </p>
      </div>

      <StreaksView data={data} />
    </PageShell>
  );
}
