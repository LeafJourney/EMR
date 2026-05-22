import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";

import { loadAllHqData } from "./loaders";
import { HeroStrip } from "./tiles/hero-strip";
import { RevenueStrip } from "./tiles/revenue-strip";
import { OnboardingFunnel } from "./tiles/onboarding-funnel";
import { ModalityMix } from "./tiles/modality-mix";
import { Leaderboards } from "./tiles/leaderboards";
import { ActivityStream } from "./tiles/activity-stream";

export const metadata: Metadata = {
  title: "Leafjourney HQ",
  description: "Super-admin fleet operations dashboard.",
};

export const dynamic = "force-dynamic";

type NavLink = { label: string; href: string };

const HQ_NAV: NavLink[] = [
  { label: "Dashboard", href: "/admin/hq" },
  { label: "Practices", href: "/practices" },
  { label: "Admins", href: "/admin/console" },
  { label: "Onboarding", href: "/onboarding" },
  { label: "Templates", href: "/templates" },
  { label: "Audit Log", href: "/admin/audit" },
];

export default async function LeafjourneyHqPage() {
  const user = await requireUser();
  const snapshot = await loadAllHqData();

  return (
    <PageShell maxWidth="max-w-[1240px]">
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Dashboard" },
        ]}
      />
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-10">
        <div>
          <Eyebrow className="mb-3">Internal</Eyebrow>
          <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            Leafjourney HQ
          </h1>
          <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-xl">
            Fleet operations at a glance. Drill into any surface from the nav below.
          </p>
        </div>
        <div className="flex flex-col items-start md:items-end text-xs text-text-subtle">
          <span className="uppercase tracking-[0.18em] text-[10px] mb-1">Signed in</span>
          <span className="text-sm text-text">{user.email}</span>
          <span className="mt-1">Sign out from the sidebar identity menu.</span>
        </div>
      </header>

      <nav aria-label="HQ navigation" className="mb-12">
        <ul className="flex flex-wrap gap-1 border-b border-border/80 pb-px">
          {HQ_NAV.map((item) => {
            const isActive = item.href === "/admin/hq";
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "inline-flex items-center px-4 py-2.5 text-sm font-medium text-text border-b-2 border-text -mb-px transition-colors"
                      : "inline-flex items-center px-4 py-2.5 text-sm text-text-muted hover:text-text border-b-2 border-transparent hover:border-border-strong -mb-px transition-colors"
                  }
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <section aria-labelledby="hero-kpis-heading" className="mb-10">
        <h2 id="hero-kpis-heading" className="sr-only">Hero KPIs</h2>
        <HeroStrip counts={snapshot.counts} dailySeries={snapshot.dailySeries} />
      </section>

      <section aria-labelledby="revenue-heading" className="mb-10">
        <h2 id="revenue-heading" className="sr-only">Revenue</h2>
        <RevenueStrip revenue={snapshot.revenue} />
      </section>

      <section aria-label="Dashboard panels" className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-10">
        <Card>
          <CardHeader>
            <div className="flex items-baseline justify-between gap-3">
              <CardTitle>Onboarding funnel</CardTitle>
              <span className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">EMR-736</span>
            </div>
            <CardDescription>
              Practice configurations by stage with median time-in-stage. Stuck rows are flagged.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <OnboardingFunnel stages={snapshot.onboardingFunnel} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-baseline justify-between gap-3">
              <CardTitle>Modality & specialty mix</CardTitle>
              <span className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">EMR-739</span>
            </div>
            <CardDescription>
              Live practices grouped by enabled modality. Drift shows practices N versions behind the latest manifest.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ModalityMix
              modalityMix={snapshot.modalityMix}
              specialtyMix={snapshot.specialtyMix}
              specialtyDrift={snapshot.specialtyDrift}
            />
          </CardContent>
        </Card>
      </section>

      <section aria-labelledby="leaderboards-heading" className="mb-10">
        <div className="flex items-baseline justify-between mb-4">
          <h2 id="leaderboards-heading" className="font-display text-xl text-text tracking-tight">
            Leaderboards
          </h2>
          <span className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">EMR-744</span>
        </div>
        <Leaderboards
          topByClaims={snapshot.topByClaims}
          topByRevenue={snapshot.topByRevenue}
          topByPatientGrowth={snapshot.topByPatientGrowth}
        />
      </section>

      <section aria-labelledby="activity-heading" className="mb-10">
        <Card>
          <CardHeader>
            <div className="flex items-baseline justify-between gap-3">
              <CardTitle id="activity-heading">24h activity</CardTitle>
              <span className="text-[11px] uppercase tracking-[0.16em] text-text-subtle">EMR-744</span>
            </div>
            <CardDescription>
              Cross-fleet super-admin actions. Refreshes every 30 seconds.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ActivityStream rows={snapshot.recentActivity} />
          </CardContent>
        </Card>
      </section>
    </PageShell>
  );
}
