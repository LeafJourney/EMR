"use client";

import React from "react";
import { CohortSimulator } from "@/components/leafnerd/CohortSimulator";
import type { CohortStatusCount } from "@/lib/leafnerd/types";

/**
 * CohortSurface — Leafnerd SPA wrapper around the existing, working
 * <CohortSimulator/> real-data component.
 *
 * The embedded component was authored against the EMR's "leafmart" Tailwind
 * theme (classes like bg-bg, bg-bg-surface, text-text-strong, text-text-muted,
 * accent-strong, border, error/warning). Those Tailwind utilities resolve to
 * CSS custom properties (--bg, --surface, --text, --text-muted, --accent-strong,
 * --border, --warning, --danger) that are ONLY declared under `.theme-leafmart`
 * — they are not defined inside the SPA's `.ln-root` botanical scope.
 *
 * THEME BRIDGE (three layers — applied together):
 *   1. `className="theme-leafmart"` re-establishes every backing variable, so the
 *      component renders with correct, complete colors regardless of anything else
 *      (the resilient fallback path).
 *   2. Inline `style` (BOTANICAL_BRIDGE) overrides those backing variables with
 *      botanical-palette hexes lifted from leafnerd-theme.css, so every Tailwind
 *      class that DOES resolve to a var adopts the Leafnerd warm look — plus the
 *      `--color-accent-strong` / `--color-bg` vars the inline SVG gradients read.
 *   3. The `cohort-skin` class hooks a scoped `.ln-root .cohort-skin …` block
 *      appended to leafnerd-theme.css. That block is required because several
 *      classes the component uses (bg-bg-surface, bg-bg-highlight, text-text-strong,
 *      bg-error / text-error / border-error) reference Tailwind color KEYS that do
 *      NOT exist in tailwind.config.ts (only `surface`, `text`, `danger` etc. do),
 *      so Tailwind emits NO rule for them and the variable bridge can't reach them.
 *      The appended CSS restyles those exact classes to botanical tones. ALL of it
 *      stays under `.ln-root .cohort-skin`, so nothing leaks to the wider EMR.
 *
 * NOTE on var names: this codebase's leafmart tokens are backed by bare vars
 * (--bg, --surface, ...), NOT the `--color-bg`-style names. The bridge therefore
 * sets the real backing vars (and additionally the `--color-*` aliases the SVG
 * gradient stops fall back through). (See report.)
 */

// Botanical palette mapped onto leafmart backing variables (values from
// src/components/leafnerd/fhir-intelligence/leafnerd-theme.css).
const BOTANICAL_BRIDGE: React.CSSProperties = {
  // surfaces
  ["--bg" as never]: "#F6F2E9", // --cream (app canvas)
  ["--bg-deep" as never]: "#EFE9DA", // --cream-deep
  ["--surface" as never]: "#FDFCF8", // --paper (card surface)
  ["--surface-raised" as never]: "#FDFCF8",
  ["--surface-muted" as never]: "#FAF7EF", // --paper-2
  // text
  ["--text" as never]: "#1E2922", // --ink
  ["--text-muted" as never]: "#6B756D", // --muted
  ["--text-subtle" as never]: "#97A099", // --faint
  ["--text-soft" as never]: "#46514A", // --ink-2
  ["--muted" as never]: "#6B756D",
  ["--ink" as never]: "#1E2922",
  // brand / accent
  ["--accent" as never]: "#2F7C51", // --canopy
  ["--accent-hover" as never]: "#21603D", // --canopy-deep
  ["--accent-strong" as never]: "#2F7C51", // --canopy
  ["--accent-soft" as never]: "#DDEBE0", // --canopy-soft
  ["--leaf" as never]: "#2F7C51",
  ["--leaf-soft" as never]: "#ECF3EC", // --canopy-faint
  // lines
  ["--border" as never]: "#E2DDCF", // --line
  ["--border-strong" as never]: "#D7E0D2", // --line-sage
  // highlight
  ["--highlight" as never]: "#B9831C", // --amber
  ["--highlight-hover" as never]: "#8a6010",
  ["--highlight-soft" as never]: "#F4E9CF", // --amber-soft
  // semantic
  ["--success" as never]: "#2F7C51", // --canopy
  ["--warning" as never]: "#B9831C", // --amber
  ["--danger" as never]: "#AE4435", // --rose
  ["--info" as never]: "#4C58A6", // --indigo
  // SVG gradient fallbacks — the simulator's <linearGradient> stops and the peak
  // dot read `var(--color-accent-strong, #10b981)` / `var(--color-bg, #0d0f12)`
  // (dark defaults). Define the `--color-*` aliases so the chart is canopy-on-cream.
  ["--color-accent-strong" as never]: "#2F7C51", // --canopy
  ["--color-bg" as never]: "#F6F2E9", // --cream
};

// Believable demo cohort tally for when no real groupBy data is supplied.
const DEMO_STATUS_COUNTS: CohortStatusCount[] = [
  { status: "active", count: 1842 },
  { status: "prospect", count: 613 },
  { status: "inactive", count: 287 },
  { status: "archived", count: 96 },
];

export function CohortSurface({
  statusCounts,
}: {
  statusCounts?: CohortStatusCount[];
}) {
  // Cardinal resilience: always feed the simulator a full, believable payload.
  const source =
    statusCounts && statusCounts.length > 0 ? statusCounts : DEMO_STATUS_COUNTS;

  // CohortSimulator expects `{ status, _count }[]`; adapt CohortStatusCount[].
  const simStatusCounts = source.map((s) => ({
    status: s.status,
    _count: s.count,
  }));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <h1 className="page-title">Cohort Simulator</h1>
          <p className="page-lede">
            Model treatment efficacy across synthetic patient profiles. Tap a
            preset cohort (e.g. high-risk diabetics), pick a dosing regimen, then
            run a Monte Carlo projection. Hover the distribution to reveal the
            shaded confidence band, adverse-event probability, and optimal dosage.
          </p>
        </div>
      </div>

      {/* THEME BRIDGE: theme-leafmart re-establishes the leafmart backing vars
          (resilient fallback); the inline style remaps them to botanical hexes;
          and `cohort-skin` hooks the appended `.ln-root .cohort-skin` overrides
          that catch the classes Tailwind never emits (see leafnerd-theme.css). */}
      <div
        className="theme-leafmart cohort-skin"
        style={{ ...BOTANICAL_BRIDGE, marginTop: 22 }}
      >
        <CohortSimulator statusCounts={simStatusCounts} />
      </div>
    </div>
  );
}

export default CohortSurface;
