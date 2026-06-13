import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  MODULE_CATALOG,
  MODULE_PILLAR_LABELS,
  MODULE_TIERS,
  modulesByPillar,
  type ModulePillar,
  type ModuleStatus,
} from "@/lib/platform/modules";
import { ModulesTierTable, type TierRow } from "./modules-tier-table";

export const metadata = { title: "Platform modules" };

const STATUS_TONE: Record<ModuleStatus, "success" | "highlight" | "info" | "neutral" | "warning"> = {
  ga: "success",
  beta: "highlight",
  preview: "info",
  in_development: "warning",
  roadmap: "neutral",
};

const STATUS_LABELS: Record<ModuleStatus, string> = {
  ga: "GA",
  beta: "Beta",
  preview: "Preview",
  in_development: "In dev",
  roadmap: "Roadmap",
};

export default async function PlatformModulesPage() {
  await requireUser();
  const grouped = modulesByPillar();
  const pillars = Object.keys(grouped) as ModulePillar[];
  const orderedPillars: ModulePillar[] = [
    "clinical",
    "patient_engagement",
    "billing",
    "research",
    "commerce",
    "operations",
    "platform",
  ].filter((p) => pillars.includes(p as ModulePillar)) as ModulePillar[];

  const totalModules = MODULE_CATALOG.length;
  const gaCount = MODULE_CATALOG.filter((m) => m.status === "ga").length;
  const tierEntries = Object.entries(MODULE_TIERS).sort(
    ([, a], [, b]) => a.ordering - b.ordering,
  );

  const tierRows: TierRow[] = tierEntries.map(([id, t]) => ({
    id,
    label: t.label,
    monthlyLabel: t.monthlyLabel,
    monthlyList: t.monthlyList,
    bestFor: t.bestFor,
    blurb: t.blurb,
  }));

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow="Platform · EMR-044"
        title="Modular EMR catalog"
        description="Every surface, agent, and integration the platform sells. Source of truth for licensing, the comparator, and the public menu."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <Card tone="raised">
          <CardContent className="pt-6">
            <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">Modules</p>
            <p className="font-display text-3xl mt-2 tabular-nums">{totalModules}</p>
            <p className="text-xs text-text-muted mt-1">
              Across {orderedPillars.length} pillars.
            </p>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="pt-6">
            <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">GA today</p>
            <p className="font-display text-3xl mt-2 tabular-nums">{gaCount}</p>
            <p className="text-xs text-text-muted mt-1">
              Production-ready, signed BAA included.
            </p>
          </CardContent>
        </Card>
        <Card tone="raised">
          <CardContent className="pt-6">
            <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle">Tiers</p>
            <p className="font-display text-3xl mt-2 tabular-nums">{tierEntries.length}</p>
            <p className="text-xs text-text-muted mt-1">
              Starter → Enterprise.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-10">
        <CardHeader className="px-0 pt-0">
          <CardTitle>Tier reference</CardTitle>
          <CardDescription>
            Each tier bundles a default module mix; à la carte add-ons available.
          </CardDescription>
        </CardHeader>
        <ModulesTierTable rows={tierRows} />
      </div>

      {orderedPillars.map((pillar) => (
        <section key={pillar} className="mb-10">
          <h2 className="font-display text-xl text-text mb-4">
            {MODULE_PILLAR_LABELS[pillar]}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {grouped[pillar].map((m) => (
              <Card key={m.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <CardTitle>{m.name}</CardTitle>
                      <CardDescription>{m.tagline}</CardDescription>
                    </div>
                    <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABELS[m.status]}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-text-muted leading-relaxed">{m.description}</p>
                  <div className="mt-4 grid grid-cols-2 gap-3 text-[11px]">
                    <div>
                      <p className="uppercase tracking-[0.14em] text-text-subtle mb-1">
                        Tiers
                      </p>
                      <p className="text-text-muted">{m.includedIn.join(", ")}</p>
                    </div>
                    <div>
                      <p className="uppercase tracking-[0.14em] text-text-subtle mb-1">
                        À la carte
                      </p>
                      <p className="text-text-muted">
                        {m.alaCarteMonthly == null
                          ? "Tier only"
                          : `$${m.alaCarteMonthly}/mo`}
                      </p>
                    </div>
                    {m.agents.length > 0 && (
                      <div className="col-span-2">
                        <p className="uppercase tracking-[0.14em] text-text-subtle mb-1">
                          Agents
                        </p>
                        <p className="text-text-muted">{m.agents.join(", ")}</p>
                      </div>
                    )}
                    {m.integrations.length > 0 && (
                      <div className="col-span-2">
                        <p className="uppercase tracking-[0.14em] text-text-subtle mb-1">
                          Integrations
                        </p>
                        <p className="text-text-muted">{m.integrations.join(", ")}</p>
                      </div>
                    )}
                    {m.tickets.length > 0 && (
                      <div className="col-span-2">
                        <p className="uppercase tracking-[0.14em] text-text-subtle mb-1">
                          Tickets
                        </p>
                        <p className="font-mono text-text-muted">{m.tickets.join(" · ")}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
