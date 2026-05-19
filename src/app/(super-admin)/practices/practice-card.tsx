"use client";

// Horizontal practice card with a click-to-expand KPI drawer.
//
// Collapsed: practice name + specialty + key people + location chips.
// Expanded: KPI grid (providers, patients, claims volume, billed, paid,
// gateway GM, encounters) + tag list + activity strip.
//
// The card body is a button so the whole row is keyboard-activatable; the
// drawer toggles aria-expanded for screen readers.

import * as React from "react";
import { ChevronDown, MapPin, Users, Stethoscope, Mail } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
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

function StatusBadge({ status, publishedAt }: { status: string; publishedAt: string | null }) {
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

function Kpi({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">{label}</div>
      <div className="font-display text-xl text-text tracking-tight mt-1">{value}</div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function PracticeCard({ practice }: { practice: PracticeCardData }) {
  const [expanded, setExpanded] = React.useState(false);
  const drawerId = React.useId();

  const specialtyLabel = humanizeSpecialty(practice.specialty);
  const careModelLabel = humanizeCareModel(practice.careModel);
  const location = [practice.city, practice.state].filter(Boolean).join(", ");

  const officeManager = practice.officeManagers[0];
  const leadProvider = practice.leadProviders[0];

  return (
    <Card tone={expanded ? "raised" : "default"} className="transition-all">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        aria-controls={drawerId}
        className="w-full text-left px-6 py-5 flex items-center gap-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xl"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="font-display text-lg text-text tracking-tight truncate">
              {practice.practiceName}
            </h3>
            <StatusBadge status={practice.status} publishedAt={practice.publishedAt} />
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

        <ChevronDown
          className={cn(
            "h-5 w-5 text-text-muted shrink-0 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div
          id={drawerId}
          className="px-6 pb-6 pt-1 border-t border-border/60 mt-1 grid gap-6"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Active providers"
              value={String(practice.kpi.activeProviderCount)}
              sub={`${practice.kpi.providerCount} total on roster`}
            />
            <Kpi
              label="Patients"
              value={formatNumber(practice.kpi.patientCount)}
              sub="Non-archived"
            />
            <Kpi
              label="Claims volume"
              value={formatNumber(practice.kpi.claimCount)}
              sub={`${practice.kpi.claimsLast30} created last 30d`}
            />
            <Kpi
              label="Encounters"
              value={formatNumber(practice.kpi.encounterCount)}
              sub={`${practice.kpi.encountersLast30} in last 30d`}
            />
            <Kpi
              label="Billed (lifetime)"
              value={formatDollars(practice.kpi.billedCents)}
            />
            <Kpi
              label="Collected"
              value={formatDollars(practice.kpi.paidCents)}
              sub="Posted to claims"
            />
            <Kpi
              label="Gateway GM"
              value={formatDollars(practice.kpi.gatewayChargeCents)}
              sub="Charges run through gateway"
            />
            <Kpi
              label="Specialty"
              value={specialtyLabel}
              sub={
                practice.specialtyVersion
                  ? `v${practice.specialtyVersion}`
                  : undefined
              }
            />
          </div>

          {practice.enabledModalities.length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
                Enabled modalities
              </div>
              <div className="flex flex-wrap gap-1.5">
                {practice.enabledModalities.map((m) => (
                  <Badge key={m} tone="neutral">
                    {m.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
                Practice details
              </div>
              <dl className="text-[13px] grid gap-1.5">
                {practice.legalName && (
                  <Row label="Legal" value={practice.legalName} />
                )}
                {practice.brandName && (
                  <Row label="Brand" value={practice.brandName} />
                )}
                {location && <Row label="Location" value={location} />}
                {practice.timeZone && (
                  <Row label="Time zone" value={practice.timeZone} />
                )}
                {practice.primaryContactName && (
                  <Row
                    label="Primary contact"
                    value={
                      practice.primaryContactEmail
                        ? `${practice.primaryContactName} · ${practice.primaryContactEmail}`
                        : practice.primaryContactName
                    }
                  />
                )}
                <Row label="Care model" value={careModelLabel} />
                {practice.publishedAt && (
                  <Row
                    label="Published"
                    value={new Date(practice.publishedAt).toLocaleDateString()}
                  />
                )}
              </dl>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
                Office managers & operators
              </div>
              {practice.officeManagers.length === 0 ? (
                <div className="text-[12px] text-text-muted italic">
                  None invited yet.
                </div>
              ) : (
                <ul className="grid gap-2.5">
                  {practice.officeManagers.map((m) => (
                    <li key={m.userId}>
                      <PersonChip
                        name={m.name}
                        sub={`${m.role.replace(/_/g, " ")} · ${m.email}`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider text-text-muted mb-2">
                Key providers
              </div>
              {practice.leadProviders.length === 0 ? (
                <div className="text-[12px] text-text-muted italic">
                  No providers onboarded yet.
                </div>
              ) : (
                <ul className="grid gap-2.5">
                  {practice.leadProviders.map((p) => (
                    <li key={p.userId}>
                      <PersonChip name={p.name} sub={p.title ?? "Provider"} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[12px] text-text-muted">
            <div className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {practice.primaryContactEmail ?? "No primary contact email"}
            </div>
            <div>
              Updated{" "}
              {practice.updatedAt
                ? new Date(practice.updatedAt).toLocaleDateString()
                : "—"}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <dt className="text-text-muted w-28 shrink-0 text-[11px] uppercase tracking-wide">
        {label}
      </dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}
