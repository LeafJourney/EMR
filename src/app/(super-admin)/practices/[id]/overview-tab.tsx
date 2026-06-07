// Overview tab — lifts the 8-KPI grid + practice details / stakeholders
// that used to live in the inline drawer on PracticeCard. Semantics are
// unchanged per AC; the only difference is layout breathing room now
// that we have a full page.

import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/ui/format";
import type { PracticeCardData } from "../types";
import { humanizeCareModel, humanizeSpecialty } from "../types";
import { derivePracticeLifecycle } from "../lifecycle";
import { PracticeActivation } from "./practice-activation";

function formatDollars(cents: number): string {
  return money(cents, { abbreviate: true });
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

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-surface px-4 py-3">
      <div className="text-[11px] uppercase tracking-wide text-text-muted">
        {label}
      </div>
      <div className="font-display text-xl text-text tracking-tight mt-1">
        {value}
      </div>
      {sub && <div className="text-[11px] text-text-muted mt-0.5">{sub}</div>}
    </div>
  );
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

export function OverviewTab({ practice }: { practice: PracticeCardData }) {
  const specialtyLabel = humanizeSpecialty(practice.specialty);
  const careModelLabel = humanizeCareModel(practice.careModel);
  const location = [practice.city, practice.state].filter(Boolean).join(", ");
  const lifecycle = derivePracticeLifecycle(practice);

  return (
    <div className="grid gap-8">
      {/* Activation layer — the gate between creation pipeline and operations. */}
      <PracticeActivation practice={practice} lifecycle={lifecycle} />

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
            practice.specialtyVersion ? `v${practice.specialtyVersion}` : undefined
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

      <div className="grid gap-8 lg:grid-cols-3">
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
    </div>
  );
}
