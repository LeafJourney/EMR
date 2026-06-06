"use client";

import * as React from "react";
import {
  Megaphone,
  CalendarDays,
  ScrollText,
  ExternalLink,
  Building2,
  MapPin,
  Landmark,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import {
  BIZFED_ORGS,
  ADVOCACY_ALERTS,
  MEMBER_EVENTS,
  POSITION_STATEMENTS,
  getOrg,
  type BizFedOrg,
  type BizFedOrgId,
  type AdvocacyAlert,
  type MemberEvent,
  type PositionStatement,
} from "./bizfed-data";

type Filter = "all" | BizFedOrgId;

const URGENCY_TONE: Record<
  AdvocacyAlert["urgency"],
  React.ComponentProps<typeof Badge>["tone"]
> = {
  action: "warning",
  update: "info",
  watch: "neutral",
};

const URGENCY_LABEL: Record<AdvocacyAlert["urgency"], string> = {
  action: "Action needed",
  update: "Update",
  watch: "Watch",
};

const STANCE_TONE: Record<
  PositionStatement["stance"],
  React.ComponentProps<typeof Badge>["tone"]
> = {
  support: "success",
  oppose: "danger",
  neutral: "neutral",
};

const STANCE_LABEL: Record<PositionStatement["stance"], string> = {
  support: "Supports",
  oppose: "Opposes",
  neutral: "Neutral",
};

/** Outbound link styled as inline text link — always new tab + noopener. */
function SourceLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent-strong"
    >
      {children}
      <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
    </a>
  );
}

function OrgChip({ org }: { org: BizFedOrg }) {
  return (
    <Badge tone="accent" className="gap-1">
      <Building2 className="h-3 w-3" aria-hidden="true" />
      {org.name}
    </Badge>
  );
}

export function AdvocacyView() {
  const [filter, setFilter] = React.useState<Filter>("all");

  const match = React.useCallback(
    (orgId: BizFedOrgId) => filter === "all" || filter === orgId,
    [filter]
  );

  const alerts = ADVOCACY_ALERTS.filter((a) => match(a.orgId));
  const events = MEMBER_EVENTS.filter((e) => match(e.orgId));
  const positions = POSITION_STATEMENTS.filter((p) => match(p.orgId));

  return (
    <div className="mx-auto max-w-6xl">
      {/* ── Hero / intro ──────────────────────────────────────────────── */}
      <header className="max-w-3xl">
        <Eyebrow className="mb-2">Advocacy · in partnership with BizFed</Eyebrow>
        <h1 className="font-display text-3xl tracking-tight text-text sm:text-4xl">
          Business advocacy that moves with you
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          BizFed is a grassroots business federation — a coalition of business
          organizations that advocate together on the policies shaping our
          regional economy. LeafJourney partners with the BizFed family to
          surface advocacy that&apos;s relevant to the cannabis &amp; wellness
          community: action alerts, member events, and position statements, with
          clear attribution and links back to the official sources.
        </p>
      </header>

      {/* ── Partner org cards ─────────────────────────────────────────── */}
      <section className="mt-10" aria-labelledby="partners-heading">
        <div className="mb-4 flex items-center gap-2">
          <Landmark className="h-5 w-5 text-accent" aria-hidden="true" />
          <h2
            id="partners-heading"
            className="font-display text-xl tracking-tight text-text"
          >
            Our BizFed partners
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BIZFED_ORGS.map((org) => (
            <Card key={org.id} tone="raised" motion="hover" className="h-full">
              <CardContent className="flex h-full flex-col p-6">
                <div
                  className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent"
                  aria-hidden="true"
                >
                  <Building2 className="h-6 w-6" />
                </div>
                <h3 className="mt-4 font-display text-lg tracking-tight text-text">
                  {org.name}
                </h3>
                <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
                  {org.blurb}
                </p>
                <div className="mt-4">
                  <SourceLink href={org.url}>Visit official site</SourceLink>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* ── Org filter ────────────────────────────────────────────────── */}
      <div className="mt-10">
        <EditorialRule />
        <div
          className="mt-6 flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter by organization"
        >
          <span className="mr-1 text-xs font-medium uppercase tracking-[0.14em] text-text-subtle">
            Filter
          </span>
          <FilterPill
            active={filter === "all"}
            onClick={() => setFilter("all")}
          >
            All BizFed
          </FilterPill>
          {BIZFED_ORGS.map((org) => (
            <FilterPill
              key={org.id}
              active={filter === org.id}
              onClick={() => setFilter(org.id)}
            >
              {org.shortName}
            </FilterPill>
          ))}
        </div>
      </div>

      {/* ── Advocacy alerts ───────────────────────────────────────────── */}
      <Section
        id="alerts"
        icon={<Megaphone className="h-5 w-5 text-accent" aria-hidden="true" />}
        title="Advocacy alerts"
        subtitle="Time-sensitive ways to make your voice heard."
      >
        {alerts.length === 0 ? (
          <EmptyNote>No alerts for this organization right now.</EmptyNote>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {alerts.map((alert) => (
              <AlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </Section>

      {/* ── Member events ─────────────────────────────────────────────── */}
      <Section
        id="events"
        icon={
          <CalendarDays className="h-5 w-5 text-accent" aria-hidden="true" />
        }
        title="Member events"
        subtitle="Upcoming summits, forums, and roundtables."
      >
        {events.length === 0 ? (
          <EmptyNote>No upcoming events for this organization.</EmptyNote>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </Section>

      {/* ── Position statements / news ────────────────────────────────── */}
      <Section
        id="positions"
        icon={<ScrollText className="h-5 w-5 text-accent" aria-hidden="true" />}
        title="Position statements & news"
        subtitle="Where our partners stand on the issues."
      >
        {positions.length === 0 ? (
          <EmptyNote>No positions for this organization right now.</EmptyNote>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {positions.map((pos) => (
              <PositionCard key={pos.id} position={pos} />
            ))}
          </div>
        )}
      </Section>

      {/* ── Attribution / disclaimer footer ───────────────────────────── */}
      <footer className="mt-12">
        <Card tone="outlined">
          <CardContent className="p-5">
            <p className="text-xs leading-relaxed text-text-subtle">
              <span className="font-medium text-text-muted">
                Attribution &amp; disclaimer.
              </span>{" "}
              Content aggregated from BizFed public sources and shown for member
              awareness. Visit the official BizFed sites for the authoritative,
              current information. Partnership / data-feed integration pending —
              the items shown here are illustrative samples, not a live mirror of
              BizFed publications.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
              {BIZFED_ORGS.map((org) => (
                <SourceLink key={org.id} href={org.url}>
                  {org.name}
                </SourceLink>
              ))}
            </div>
          </CardContent>
        </Card>
      </footer>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant={active ? "primary" : "secondary"}
      size="sm"
      onClick={onClick}
      aria-pressed={active}
    >
      {children}
    </Button>
  );
}

function Section({
  id,
  icon,
  title,
  subtitle,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10" aria-labelledby={`${id}-heading`}>
      <div className="mb-1 flex items-center gap-2">
        {icon}
        <h2
          id={`${id}-heading`}
          className="font-display text-xl tracking-tight text-text"
        >
          {title}
        </h2>
      </div>
      <p className="mb-4 text-sm text-text-muted">{subtitle}</p>
      {children}
    </section>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <Card tone="outlined">
      <CardContent className="p-5">
        <p className="text-sm text-text-muted">{children}</p>
      </CardContent>
    </Card>
  );
}

function AlertCard({ alert }: { alert: AdvocacyAlert }) {
  const org = getOrg(alert.orgId);
  return (
    <Card tone="default" className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={URGENCY_TONE[alert.urgency]}>
            {URGENCY_LABEL[alert.urgency]}
          </Badge>
          <span className="text-xs text-text-subtle">{alert.dateLabel}</span>
        </div>
        <h3 className="mt-3 font-display text-base leading-snug tracking-tight text-text">
          {alert.title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
          {alert.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <OrgChip org={org} />
          <SourceLink href={alert.actionUrl}>Take action</SourceLink>
        </div>
      </CardContent>
    </Card>
  );
}

function EventCard({ event }: { event: MemberEvent }) {
  const org = getOrg(event.orgId);
  return (
    <Card key={event.id} tone="raised" motion="hover" className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex items-center gap-2 text-accent">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">{event.dateLabel}</span>
        </div>
        <h3 className="mt-2 font-display text-base leading-snug tracking-tight text-text">
          {event.title}
        </h3>
        <div className="mt-2 flex items-center gap-1.5 text-xs text-text-subtle">
          <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
          {event.location}
        </div>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
          {event.body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <OrgChip org={org} />
          <SourceLink href={event.url}>Event details</SourceLink>
        </div>
      </CardContent>
    </Card>
  );
}

function PositionCard({ position }: { position: PositionStatement }) {
  const org = getOrg(position.orgId);
  return (
    <Card tone="default" className="h-full">
      <CardContent className="flex h-full flex-col p-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={STANCE_TONE[position.stance]}>
            {STANCE_LABEL[position.stance]}
          </Badge>
          <span className="text-xs text-text-subtle">{position.dateLabel}</span>
        </div>
        <h3 className="mt-3 font-display text-base leading-snug tracking-tight text-text">
          {position.title}
        </h3>
        <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
          {position.summary}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <OrgChip org={org} />
          <SourceLink href={position.sourceUrl}>Source</SourceLink>
        </div>
      </CardContent>
    </Card>
  );
}
