// EMR-745 — Per-practice drill-in page.
//
// Server component. Auth gating is inherited from
// src/app/(super-admin)/layout.tsx which runs requireSuperAdmin() at the
// segment boundary, so any unauth'd request is redirected before we even
// resolve params here.
//
// Tabs are URL-driven (`?tab=overview|providers|activity|billing|history`).
// Each tab body is its own loader so we only fetch the data the user is
// looking at — the Overview loader runs unconditionally because we need
// the practice header (name, status badges) regardless of which tab is
// selected. EMR-743 wired the History tab; cursor paging on that tab is
// driven by the `?historyCursor=` URL param so paging stays server-side.
//
// Impersonation surfaces ("View as this practice", "Stop impersonating")
// are intentionally omitted; EMR-742 ships them. We do not stub a button
// here to avoid leaving a regression hook.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, MapPin } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";
import { ViewAsPracticeButton } from "@/components/super-admin/view-as-practice-button";

import { loadPracticeOverview } from "../loaders";
import { humanizeCareModel, humanizeSpecialty } from "../types";
import { OverviewTab } from "./overview-tab";
import { ProvidersTab } from "./providers-tab";
import { ActivityTab } from "./activity-tab";
import { BillingTab } from "./billing-tab";
import { HistoryTab } from "./history-tab";
import { TabBar, isTabKey, type TabKey } from "./tab-bar";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const practice = await loadPracticeOverview(id);
  if (!practice) {
    return { title: "Practice not found — Leafjourney" };
  }
  return {
    title: `${practice.practiceName} — Leafjourney`,
    description: `Drill-in for ${practice.practiceName} — KPIs, providers, activity, and billing.`,
  };
}

export default async function PracticeDrillInPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ tab?: string; historyCursor?: string }>;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const requestedTab = sp.tab;
  const activeTab: TabKey = isTabKey(requestedTab) ? requestedTab : "overview";
  const historyCursor = sp.historyCursor ?? null;

  const practice = await loadPracticeOverview(id);
  if (!practice) {
    notFound();
  }

  const specialtyLabel = humanizeSpecialty(practice.specialty);
  const careModelLabel = humanizeCareModel(practice.careModel);
  const location = [practice.city, practice.state].filter(Boolean).join(", ");

  return (
    <PageShell maxWidth="max-w-[1280px]">
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Operations" },
          { label: "Practices", href: "/practices" },
          { label: practice.practiceName },
        ]}
      />

      <div className="mb-6">
        <Link
          href="/practices"
          className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All practices
        </Link>
      </div>

      <div className="flex flex-col gap-5 mb-8">
        <Eyebrow>Leafjourney HQ</Eyebrow>
        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
              {practice.practiceName}
            </h1>
            {practice.organizationName !== practice.practiceName && (
              <div className="text-[13px] text-text-muted mt-1.5">
                {practice.organizationName}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-3">
              <StatusBadge
                status={practice.status}
                publishedAt={practice.publishedAt}
              />
              <Badge tone="accent">{specialtyLabel}</Badge>
              {practice.careModel && (
                <Badge tone="neutral">{careModelLabel}</Badge>
              )}
              {location && (
                <span className="inline-flex items-center gap-1.5 text-[12px] text-text-muted ml-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {location}
                </span>
              )}
            </div>
          </div>
          {/* EMR-742 Phase 2 — super-admin-only; the (super-admin) layout
              guards this segment with requireSuperAdmin() so anyone who
              renders this page is already cleared to see the button. */}
          <ViewAsPracticeButton
            practiceOrgId={practice.organizationId}
            practiceName={practice.practiceName}
          />
        </div>
      </div>

      <TabBar
        practiceId={practice.configId ?? practice.organizationId}
        active={activeTab}
      />

      {activeTab === "overview" && <OverviewTab practice={practice} />}
      {activeTab === "providers" && (
        <ProvidersTab organizationId={practice.organizationId} />
      )}
      {activeTab === "activity" && (
        <ActivityTab organizationId={practice.organizationId} />
      )}
      {activeTab === "billing" && (
        <BillingTab organizationId={practice.organizationId} />
      )}
      {activeTab === "history" && (
        <HistoryTab
          practiceRouteId={id}
          organizationId={practice.organizationId}
          alsoSubjectIds={[
            practice.configId,
            practice.practiceId,
            practice.organizationId,
          ].filter((s): s is string => !!s)}
          cursor={historyCursor}
        />
      )}
    </PageShell>
  );
}

function StatusBadge({
  status,
  publishedAt,
}: {
  status: string;
  publishedAt: string | null;
}) {
  if (publishedAt) return <Badge tone="success">Live</Badge>;
  if (status === "draft") return <Badge tone="neutral">Draft</Badge>;
  if (status === "archived") return <Badge tone="warning">Archived</Badge>;
  return <Badge tone="info">{status}</Badge>;
}
