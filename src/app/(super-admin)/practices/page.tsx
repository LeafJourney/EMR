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
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";

import { loadPracticeLandingCards } from "./loaders";
import { PracticeCard } from "./practice-card";
import { PublishedBanner } from "./published-banner";
import { money } from "@/lib/ui/format";
import type { PracticeCardData } from "./types";
import { derivePracticeLifecycle, type PracticeLifecycle } from "./lifecycle";

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

  // Section by derived lifecycle so active practices never become a junk
  // drawer — creation pipeline (in-creation / needs-review) is kept distinct
  // from operational (active) and history (archived).
  const withLifecycle = practices.map((p) => ({
    practice: p,
    lifecycle: derivePracticeLifecycle(p),
  }));
  const active = withLifecycle.filter((x) => x.lifecycle.stage === "active");
  const needsReview = withLifecycle.filter(
    (x) => x.lifecycle.stage === "needs_review",
  );
  const inCreation = withLifecycle.filter((x) =>
    ["draft", "onboarding", "ready_for_invites", "ready_for_activation"].includes(
      x.lifecycle.stage,
    ),
  );
  const archived = withLifecycle.filter((x) => x.lifecycle.stage === "archived");

  const totalProviders = practices.reduce(
    (sum, p) => sum + p.kpi.activeProviderCount,
    0,
  );
  const totalClaims = practices.reduce((sum, p) => sum + p.kpi.claimCount, 0);
  const totalPaidCents = practices.reduce((sum, p) => sum + p.kpi.paidCents, 0);

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Operations" },
          { label: "Practices" },
        ]}
      />
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
            sub={`${active.length} active · ${inCreation.length} in setup · ${needsReview.length} need review`}
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
            value={money(totalPaidCents, { compactDollars: true })}
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
          {active.length > 0 && (
            <PracticeSection
              title="Active practices"
              hint="Live and operational"
              items={active}
            />
          )}
          {needsReview.length > 0 && (
            <PracticeSection
              title="Needs review"
              hint="Blockers to resolve before activation"
              items={needsReview}
              tone="warning"
            />
          )}
          {inCreation.length > 0 && (
            <PracticeSection
              title="In creation"
              hint="Drafts and in-progress onboarding"
              items={inCreation}
            />
          )}
          {archived.length > 0 && (
            <PracticeSection
              title="Archived"
              hint="Retained for history"
              items={archived}
            />
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
  tone,
}: {
  title: string;
  count: number;
  hint?: string;
  tone?: "warning";
}) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="font-display text-lg text-text tracking-tight flex items-center gap-2">
        {tone === "warning" && (
          <span className="h-2 w-2 rounded-full bg-amber-500" aria-hidden="true" />
        )}
        {title}{" "}
        <span
          className={
            tone === "warning"
              ? "text-amber-600 text-sm font-normal"
              : "text-text-muted text-sm font-normal"
          }
        >
          ({count})
        </span>
      </h2>
      {hint && <span className="text-[12px] text-text-muted">{hint}</span>}
    </div>
  );
}

function PracticeSection({
  title,
  hint,
  items,
  tone,
}: {
  title: string;
  hint?: string;
  items: { practice: PracticeCardData; lifecycle: PracticeLifecycle }[];
  tone?: "warning";
}) {
  return (
    <section>
      <SectionHeader title={title} count={items.length} hint={hint} tone={tone} />
      <div className="grid gap-3">
        {items.map((x) => (
          <PracticeCard
            key={x.practice.configId ?? x.practice.organizationId}
            practice={x.practice}
          />
        ))}
      </div>
    </section>
  );
}
