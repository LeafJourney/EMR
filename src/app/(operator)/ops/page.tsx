import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { AmbientOrb } from "@/components/ui/hero-art";
import { OwnerDashboard } from "@/components/operator/owner-dashboard";
import { loadOwnerKpis } from "@/lib/domain/owner-kpis";
import { agentRegistry } from "@/lib/agents";

export const metadata = { title: "Practice overview" };

// The owner home: a heart-of-the-business KPI snapshot.
// One Promise.all of small queries against existing tables — no new schema.
export default async function OpsOverviewPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const snapshot = await loadOwnerKpis(orgId);
  const hasPracticeManagerAgent = "practiceManager" in agentRegistry;

  return (
    <PageShell maxWidth="max-w-[1320px]">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised ambient mb-10">
        <AmbientOrb className="absolute -right-10 -top-4 h-[260px] w-[500px] opacity-90" />
        <div className="relative px-8 md:px-12 py-12 md:py-14 max-w-3xl">
          <Eyebrow className="mb-4">Practice operations</Eyebrow>
          <h1 className="font-display text-4xl md:text-5xl leading-[1.05] tracking-tight text-text">
            {user.organizationName ?? "Your practice"}, in one glance.
          </h1>
          <p className="text-[15px] text-text-muted mt-4 leading-relaxed max-w-2xl">
            Money in, work in flight, where attention is needed. The numbers
            you check ten times a day, in one quiet view.
          </p>
        </div>
      </section>

      {/* The dashboard */}
      <OwnerDashboard snapshot={snapshot} hasPracticeManagerAgent={hasPracticeManagerAgent} />
    </PageShell>
  );
}
