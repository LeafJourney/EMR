// Post-onboarding Practice Landing dashboard.
//
// Renders one horizontal card per practice (PracticeConfiguration) with a
// click-to-expand drawer showing KPIs (provider count, claims volume,
// billed/paid, gateway GM, encounters). Visited after Step 15 publishes a
// configuration; also reachable from the super-admin nav so the user can
// audit the full fleet at a glance.

import Link from "next/link";
import type { Metadata } from "next";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow, EmptyIllustration } from "@/components/ui/ornament";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";

import { loadPracticeLandingCards } from "./loaders";
import { PracticeCard } from "./practice-card";
import { PublishedBanner } from "./published-banner";

export const metadata: Metadata = {
  title: "Practices — Leafjourney",
  description: "Fleet overview of every onboarded practice on Leafjourney.",
};

export const dynamic = "force-dynamic";

export default async function PracticesLandingPage({
  searchParams,
}: {
  searchParams?: Promise<{ published?: string }>;
}) {
  const params = (await searchParams) ?? {};
  const justPublished = params.published === "1";
  const practices = await loadPracticeLandingCards();

  const published = practices.filter((p) => p.publishedAt);
  const drafts = practices.filter((p) => !p.publishedAt);

  const totalProviders = practices.reduce(
    (sum, p) => sum + p.kpi.activeProviderCount,
    0,
  );
  const totalClaims = practices.reduce((sum, p) => sum + p.kpi.claimCount, 0);
  const totalPaidCents = practices.reduce((sum, p) => sum + p.kpi.paidCents, 0);

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <PageHeader
        eyebrow="Leafjourney HQ"
        title="Practices"
        description="Every practice you've configured, with live KPIs. Click any card to expand."
        actions={
          <Link href="/onboarding">
            <Button>Onboard a practice</Button>
          </Link>
        }
      />

      {justPublished && <PublishedBanner />}

      {practices.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
          <SummaryStat
            label="Practices"
            value={String(practices.length)}
            sub={`${published.length} live · ${drafts.length} draft`}
          />
          <SummaryStat
            label="Active providers"
            value={String(totalProviders)}
            sub="Across all practices"
          />
          <SummaryStat
            label="Claims volume"
            value={totalClaims.toLocaleString()}
            sub="Lifetime"
          />
          <SummaryStat
            label="Collected"
            value={`$${(totalPaidCents / 100).toLocaleString(undefined, {
              maximumFractionDigits: 0,
            })}`}
            sub="Posted to claims"
          />
        </div>
      )}

      {practices.length === 0 ? (
        <Card tone="outlined">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <EmptyIllustration size={140} className="mb-6 opacity-80" />
            <Eyebrow className="mb-2">No practices yet</Eyebrow>
            <h2 className="font-display text-xl text-text">
              Onboard your first practice
            </h2>
            <p className="text-sm text-text-muted mt-2 max-w-md">
              The onboarding wizard walks you through specialty, care model,
              providers, and modalities. Once you publish, the practice will
              appear here with live KPIs.
            </p>
            <div className="mt-6">
              <Link href="/onboarding">
                <Button>Start onboarding</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-8">
          {published.length > 0 && (
            <section>
              <SectionHeader
                title="Live practices"
                count={published.length}
              />
              <div className="grid gap-3">
                {published.map((p) => (
                  <PracticeCard key={p.configId ?? p.organizationId} practice={p} />
                ))}
              </div>
            </section>
          )}

          {drafts.length > 0 && (
            <section>
              <SectionHeader
                title="In flight"
                count={drafts.length}
                hint="Drafts and pending publishes"
              />
              <div className="grid gap-3">
                {drafts.map((p) => (
                  <PracticeCard key={p.configId ?? p.organizationId} practice={p} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}

function SummaryStat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card tone="ambient" className="px-5 py-4">
      <div className="text-[11px] uppercase tracking-wider text-text-muted">
        {label}
      </div>
      <div className="font-display text-2xl text-text tracking-tight mt-1">
        {value}
      </div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
    </Card>
  );
}

function SectionHeader({
  title,
  count,
  hint,
}: {
  title: string;
  count: number;
  hint?: string;
}) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="font-display text-lg text-text tracking-tight">
        {title}{" "}
        <span className="text-text-muted text-sm font-normal">({count})</span>
      </h2>
      {hint && <span className="text-[12px] text-text-muted">{hint}</span>}
    </div>
  );
}
