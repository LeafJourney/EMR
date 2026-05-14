import { redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow, EditorialRule, LeafSprig } from "@/components/ui/ornament";
import { SpiritualCheckIn } from "./spiritual-check-in";
import { SPIRITUAL_LIFESTYLE_ACTIONS } from "@/lib/lifestyle/spiritual-wellness";

export const metadata = { title: "Spiritual wellness" };

// ---------------------------------------------------------------------------
// EMR-095 — Spiritual Wellness Lifestyle Category
//
// A dedicated page that lets the patient log their weekly progress across
// the five spiritual sub-domains. The score feeds into the four-pillars
// (EMR-093) Spiritual bar via the lifestyle-tab adapter.
//
// Persistence lives in localStorage (per ISO week, per patient) so we ship
// the surface today and migrate to Prisma when the data is read by other
// surfaces. The module that does the math (`spiritual-wellness.ts`) is
// already shared by the lifestyle adapter and the four-pillars page.
// ---------------------------------------------------------------------------

export default async function SpiritualWellnessPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true, firstName: true },
  });
  if (!patient) redirect("/portal/intake");

  return (
    <PageShell maxWidth="max-w-[920px]">
      <Card tone="ambient" className="mb-8 grain">
        <div className="relative z-10 px-6 md:px-10 py-8 md:py-12">
          <Eyebrow className="mb-3">Spiritual wellness</Eyebrow>
          <h1 className="font-display text-3xl md:text-[2.5rem] text-text tracking-tight leading-[1.08]">
            What feeds your spirit this week?
          </h1>
          <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-xl">
            Five practices — faith, charity, family & friends, meditation, and
            time outdoors. Tap as you go through the week. Your score feeds the
            Spiritual pillar on the{" "}
            <Link href="/portal/lifestyle/pillars" className="text-accent hover:underline">
              four pillars
            </Link>{" "}
            chart.
          </p>
        </div>
      </Card>

      <SpiritualCheckIn patientId={patient.id} />

      <EditorialRule className="my-10" />

      <section className="space-y-4">
        <Eyebrow>Today's invitations</Eyebrow>
        <p className="text-sm text-text-muted">
          Short, doable actions you can pick up anywhere. No spreadsheet, no
          spreadsheet feelings.
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {SPIRITUAL_LIFESTYLE_ACTIONS.slice(0, 6).map((action) => (
            <Card key={action.id} tone="raised">
              <CardContent className="py-4">
                <div className="flex items-baseline justify-between gap-2 mb-1.5">
                  <p className="font-medium text-text">{action.title}</p>
                  <span className="text-[11px] text-text-subtle uppercase tracking-[0.14em]">
                    {action.minutes} min
                  </span>
                </div>
                <p className="text-sm text-text-muted leading-relaxed">
                  {action.body}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <EditorialRule className="my-10" />

      <Card>
        <CardContent className="py-8 text-center">
          <p className="font-display text-xl text-text tracking-tight mb-2">
            Loneliness is a clinical risk factor.
          </p>
          <p className="text-sm text-text-muted max-w-md mx-auto leading-relaxed">
            One protected hour with people you love is a real intervention. So
            is five quiet minutes of awe. Do the small thing.
          </p>
          <div className="mt-5 flex items-center justify-center gap-2 text-accent/50">
            <LeafSprig size={16} />
            <span className="text-[11px] font-medium uppercase tracking-[0.16em]">
              Small acts. Long memory.
            </span>
            <LeafSprig size={16} />
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
