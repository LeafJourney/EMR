"use client";

import * as React from "react";
import { Activity, FlaskConical, BookOpen, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { Heatmap } from "./heatmap";
import { SeasonalDetector } from "./seasonal-detector";
import type {
  HeatmapData,
  SeasonalSeries,
  HeadlineStat,
} from "./research-data";

// EMR-374 — Interactive Analytics Lab view. Two tabs: "Analytics Lab" (the
// default focus, hosting the heatmap + seasonal detector) and a "Research
// articles" placeholder. All data arrives via props from the server page so
// this component stays deterministic and free of server-only imports.

type TabId = "lab" | "articles";

export function AnalyticsLab({
  heatmap,
  seasonal,
  stats,
  lastUpdatedLabel,
}: {
  heatmap: HeatmapData;
  seasonal: SeasonalSeries[];
  stats: HeadlineStat[];
  lastUpdatedLabel: string;
}) {
  const [tab, setTab] = React.useState<TabId>("lab");

  return (
    <div>
      {/* Live indicator strip */}
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 shadow-sm">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-accent opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="text-xs font-medium text-text">
          Live · aggregated from the community
        </span>
        <span className="text-xs text-text-subtle">· {lastUpdatedLabel}</span>
      </div>

      {/* Headline stats */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label} tone="raised">
            <CardContent className="px-5 py-4">
              <p className="font-display text-2xl tracking-tight text-text">
                {s.value}
              </p>
              <p className="mt-0.5 text-sm font-medium text-text-muted">
                {s.label}
              </p>
              <p className="mt-1 text-xs text-text-subtle">{s.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div
        className="mb-5 inline-flex rounded-full border border-border bg-surface-muted p-1"
        role="tablist"
        aria-label="Research sections"
      >
        <TabButton
          active={tab === "lab"}
          onClick={() => setTab("lab")}
          id="tab-lab"
          controls="panel-lab"
          icon={<FlaskConical className="h-4 w-4" aria-hidden="true" />}
        >
          Analytics Lab
        </TabButton>
        <TabButton
          active={tab === "articles"}
          onClick={() => setTab("articles")}
          id="tab-articles"
          controls="panel-articles"
          icon={<BookOpen className="h-4 w-4" aria-hidden="true" />}
        >
          Research articles
        </TabButton>
      </div>

      {tab === "lab" ? (
        <div id="panel-lab" role="tabpanel" aria-labelledby="tab-lab" className="space-y-6">
          {/* Heatmap */}
          <Card tone="default">
            <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
              <div className="mb-4 flex items-start justify-between gap-4">
                <div>
                  <Eyebrow className="mb-1.5">Patient trend heatmap</Eyebrow>
                  <h2 className="font-display text-xl tracking-tight text-text">
                    How reported outcomes are trending
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Average reported improvement across six outcome dimensions
                    over the trailing twelve weeks. Brighter cells mean stronger
                    community-reported improvement.
                  </p>
                </div>
                <Badge tone="accent" className="hidden sm:inline-flex">
                  <Activity className="h-3 w-3" aria-hidden="true" />
                  6 metrics
                </Badge>
              </div>
              <Heatmap data={heatmap} />
            </CardContent>
          </Card>

          {/* Seasonal detector */}
          <Card tone="default">
            <CardContent className="px-5 py-5 sm:px-6 sm:py-6">
              <div className="mb-4">
                <Eyebrow className="mb-1.5">Seasonal pattern detector</Eyebrow>
                <h2 className="font-display text-xl tracking-tight text-text">
                  How outcomes move with the seasons
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Pick a metric to see how community-reported outcomes rise and
                  fall across the calendar year — and the seasonal pattern we
                  detected in the aggregate.
                </p>
              </div>
              <SeasonalDetector series={seasonal} />
            </CardContent>
          </Card>

          {/* Privacy note */}
          <div className="flex items-center gap-2 text-xs text-text-subtle">
            <ShieldCheck className="h-4 w-4 text-accent" aria-hidden="true" />
            <span>Aggregated, de-identified, never personally identifiable.</span>
          </div>
        </div>
      ) : (
        <div
          id="panel-articles"
          role="tabpanel"
          aria-labelledby="tab-articles"
        >
          <Card tone="outlined">
            <CardContent className="px-6 py-12 text-center">
              <BookOpen
                className="mx-auto mb-3 h-8 w-8 text-text-subtle"
                aria-hidden="true"
              />
              <h2 className="font-display text-lg tracking-tight text-text">
                Research articles
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
                A curated, citation-backed library of cannabis research is on the
                way. In the meantime, explore the Analytics Lab for live,
                community-reported outcome trends.
              </p>
              <div className="mx-auto mt-5 max-w-xs">
                <EditorialRule />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  id,
  controls,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  id: string;
  controls: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-selected={active}
      aria-controls={controls}
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        active
          ? "bg-accent text-accent-ink shadow-sm"
          : "text-text-muted hover:text-text",
      ].join(" ")}
    >
      {icon}
      {children}
    </button>
  );
}
