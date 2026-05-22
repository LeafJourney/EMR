// Horizontal practice card — the list item on /practices.
//
// EMR-745: the card used to expand inline; now it navigates to the
// per-practice drill-in page at /practices/[id]. The collapsed-state
// markup is unchanged so the list view feels identical at a glance,
// only the click target is now a <Link>. The page-level overview tab
// re-renders the KPI grid that used to live in the drawer.

import * as React from "react";
import Link from "next/link";
import { ChevronRight, MapPin, Stethoscope, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { PracticeCardData } from "./types";
import { humanizeCareModel, humanizeSpecialty } from "./types";

function formatDollars(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000) return `$${(dollars / 1_000_000).toFixed(1)}M`;
  if (dollars >= 1_000) return `$${(dollars / 1_000).toFixed(1)}K`;
  return `$${dollars.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
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

function PersonChip({ name, sub }: { name: string; sub?: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="h-7 w-7 rounded-full bg-accent-soft text-accent text-[11px] font-medium flex items-center justify-center shrink-0">
        {initials(name) || "?"}
      </div>
      <div className="min-w-0">
        <div className="text-[13px] text-text truncate leading-tight">{name}</div>
        {sub && (
          <div className="text-[11px] text-text-muted truncate leading-tight">{sub}</div>
        )}
      </div>
    </div>
  );
}

export function PracticeCard({ practice }: { practice: PracticeCardData }) {
  const specialtyLabel = humanizeSpecialty(practice.specialty);
  const careModelLabel = humanizeCareModel(practice.careModel);
  const location = [practice.city, practice.state].filter(Boolean).join(", ");

  const officeManager = practice.officeManagers[0];
  const leadProvider = practice.leadProviders[0];

  // We prefer the config id (always present) so the drill-in route is
  // stable even before a Practice row gets stitched in.
  const drillId = practice.configId ?? practice.organizationId;

  return (
    <Card tone="default" className="transition-all hover:shadow-md">
      <Link
        href={`/practices/${drillId}`}
        aria-label={`Open ${practice.practiceName}`}
        className="block px-6 py-5 flex items-center gap-6 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-display text-lg text-text tracking-tight truncate">
              {practice.practiceName}
            </h3>
            <StatusBadge
              status={practice.status}
              publishedAt={practice.publishedAt}
            />
            <Badge tone="accent">{specialtyLabel}</Badge>
            {practice.careModel && <Badge tone="neutral">{careModelLabel}</Badge>}
          </div>
          {practice.organizationName !== practice.practiceName && (
            <div className="text-[12px] text-text-muted mt-1 truncate">
              {practice.organizationName}
            </div>
          )}
          <div className="flex items-center gap-5 mt-3 text-[12px] text-text-muted flex-wrap">
            {location && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" />
                {location}
              </span>
            )}
            <span className="inline-flex items-center gap-1.5">
              <Stethoscope className="h-3.5 w-3.5" />
              {practice.kpi.activeProviderCount} provider
              {practice.kpi.activeProviderCount === 1 ? "" : "s"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5" />
              {formatNumber(practice.kpi.patientCount)} patients
            </span>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-6 shrink-0 pr-2">
          {officeManager && (
            <div className="min-w-[160px]">
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                Office manager
              </div>
              <PersonChip name={officeManager.name} sub={officeManager.email} />
            </div>
          )}
          {leadProvider && (
            <div className="min-w-[160px]">
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1.5">
                Lead provider
              </div>
              <PersonChip
                name={leadProvider.name}
                sub={leadProvider.title ?? "Provider"}
              />
            </div>
          )}
          <div className="text-right min-w-[110px]">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">
              Claims
            </div>
            <div className="font-display text-lg text-text tracking-tight">
              {formatNumber(practice.kpi.claimCount)}
            </div>
            <div className="text-[11px] text-text-muted">
              {practice.kpi.claimsLast30} in last 30d
            </div>
          </div>
          <div className="text-right min-w-[110px]">
            <div className="text-[10px] uppercase tracking-wider text-text-muted">
              Paid
            </div>
            <div className="font-display text-lg text-text tracking-tight">
              {formatDollars(practice.kpi.paidCents)}
            </div>
            <div className="text-[11px] text-text-muted">collected</div>
          </div>
        </div>

        <ChevronRight className="h-5 w-5 text-text-muted shrink-0" />
      </Link>
    </Card>
  );
}
