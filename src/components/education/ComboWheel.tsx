"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ShoppingCart, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, LeafSprig } from "@/components/ui/ornament";
import { fetchComboWheelCompounds } from "@/app/education/actions";
import type { ComboWheelCompound } from "@/lib/domain/combo-wheel";

// Subtle haptic "tick" on supported mobile browsers. Some browsers throw if
// called outside a user gesture or when permissions are denied — swallow it.
function triggerHaptic(pattern: number | number[] = 15) {
  if (typeof window === "undefined") return;
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // no-op
  }
}

// Compound entries are now sourced from the EducationCompound table via the
// `fetchComboWheelCompounds` server action. The shape is the same as before;
// keep the local alias so the inner Wheel component reads cleanly.
type Compound = ComboWheelCompound;

// Module-level cache. Survives unmount/remount within a browser session, so
// switching tabs back to the wheel never re-flashes the skeleton state.
let compoundCache: ComboWheelCompound[] | null = null;
let inFlight: Promise<ComboWheelCompound[]> | null = null;

function loadCompounds(): Promise<ComboWheelCompound[]> {
  if (compoundCache) return Promise.resolve(compoundCache);
  if (inFlight) return inFlight;
  inFlight = fetchComboWheelCompounds()
    .then((rows) => {
      compoundCache = rows;
      inFlight = null;
      return rows;
    })
    .catch((err) => {
      inFlight = null;
      throw err;
    });
  return inFlight;
}

export type ComboWheelProps = {
  className?: string;
  showHeader?: boolean;
  showFooter?: boolean;
  variant?: "default" | "compact";
  onSelect?: (selectedIds: string[]) => void;
  // Marks the rendering surface so consumer-only affordances (e.g. the
  // Leafmart "Shop this Profile" CTA) stay out of clinical/Leafjourney
  // contexts where HIPAA separation matters.
  context?: "leafmart" | "clinical" | "public";
  // Pre-fetched catalog. When provided, the wheel renders with no loading
  // state — useful for server-rendered pages that fetch upstream via
  // `getComboWheelCompounds()`.
  initialCompounds?: ComboWheelCompound[];
};

export function ComboWheel({
  className,
  showHeader = true,
  showFooter = true,
  variant = "default",
  onSelect,
  context = "public",
  initialCompounds,
}: ComboWheelProps = {}) {
  const [compounds, setCompounds] = useState<ComboWheelCompound[] | null>(
    () => initialCompounds ?? compoundCache,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const isCompact = variant === "compact";

  useEffect(() => {
    if (compounds) return;
    let cancelled = false;
    loadCompounds()
      .then((rows) => {
        if (!cancelled) setCompounds(rows);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("We couldn't load the Combo Wheel. Please refresh to try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [compounds]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      onSelect?.(Array.from(next));
      return next;
    });
  };

  const selectedCompounds = useMemo(
    () => (compounds ?? []).filter((c) => selected.has(c.id)),
    [compounds, selected],
  );

  const symptomCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of selectedCompounds) {
      for (const s of c.symptoms) counts[s] = (counts[s] ?? 0) + 1;
    }
    return Object.entries(counts)
      .sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b))
      .map(([name, count]) => ({ name, count }));
  }, [selectedCompounds]);

  const allBenefits = useMemo(
    () => Array.from(new Set(selectedCompounds.flatMap((c) => c.benefits))),
    [selectedCompounds],
  );

  const allRisks = useMemo(
    () => Array.from(new Set(selectedCompounds.flatMap((c) => c.risks))),
    [selectedCompounds],
  );

  const evidenceLevel = useMemo<"Strong" | "Moderate" | "Emerging">(() => {
    if (selectedCompounds.some((c) => c.evidence === "strong")) return "Strong";
    if (selectedCompounds.some((c) => c.evidence === "moderate")) return "Moderate";
    return "Emerging";
  }, [selectedCompounds]);

  const showHeading = showHeader && !isCompact;
  const showFooterCta = showFooter && !isCompact;
  const showShopCta = context === "leafmart" && selectedCompounds.length > 0;
  const shopHref = `/leafmart/shop?compounds=${selectedCompounds
    .map((c) => c.id)
    .join(",")}`;

  const announcement = useMemo(() => {
    if (selectedCompounds.length === 0) return "";
    const names = selectedCompounds.map((c) => c.name).join(", ");
    return `Combo updated: ${selectedCompounds.length} compound${
      selectedCompounds.length === 1 ? "" : "s"
    } selected — ${names}`;
  }, [selectedCompounds]);

  return (
    <div className={cn("max-w-6xl mx-auto w-full", className)}>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>
      {showHeading && (
        <div className="text-center mb-4 sm:mb-5 px-4">
          <div className="mb-2 flex justify-center">
            <Eyebrow>Interactive pharmacology</Eyebrow>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl md:text-4xl text-text tracking-tight mb-1.5">
            Cannabis Combo Wheel
          </h2>
          <p className="text-xs sm:text-sm text-text-muted max-w-2xl mx-auto leading-relaxed">
            Tap segments to combine compounds. Tap the center to reset.
          </p>
        </div>
      )}

      <div
        className={cn(
          "grid grid-cols-1 gap-6",
          isCompact ? "" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-8",
        )}
      >
        <Card
          tone="raised"
          className={cn(
            "flex items-center justify-center",
            isCompact ? "p-4 sm:p-6" : "p-6 sm:p-8",
          )}
        >
          {compounds ? (
            <Wheel
              compounds={compounds}
              selected={selected}
              onToggle={toggle}
              onReset={() => {
                setSelected(new Set());
                onSelect?.([]);
              }}
              size={isCompact ? "sm" : "lg"}
            />
          ) : (
            <SkeletonWheel size={isCompact ? "sm" : "lg"} error={loadError} />
          )}
        </Card>

        <div className="space-y-4 sm:space-y-5">
          <Card tone="raised">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <LeafSprig size={14} className="text-accent" />
                Your Selection
              </CardTitle>
              <CardDescription>
                {selectedCompounds.length === 0
                  ? "Pick a starting compound — then add a second to unlock combos."
                  : `${selectedCompounds.length} compound${selectedCompounds.length === 1 ? "" : "s"} in this combo`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {selectedCompounds.length === 0 ? (
                <EmptyState />
              ) : (
                <div className="flex flex-wrap gap-2">
                  {selectedCompounds.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-black shadow-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
                      style={{
                        backgroundColor: c.color,
                        boxShadow: `0 4px 14px -4px ${c.color}66`,
                      }}
                      aria-label={`Remove ${c.name}`}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-black/60" aria-hidden />
                      {c.name}
                      <span className="text-black/70 ml-0.5" aria-hidden>
                        &times;
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedCompounds.length > 0 && (
            <div className="space-y-4 sm:space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <Card tone="raised">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                      <CardTitle className="text-base">Target Symptoms</CardTitle>
                      <CardDescription>
                        Conditions this combination may help with
                      </CardDescription>
                    </div>
                    <Badge
                      tone={
                        evidenceLevel === "Strong"
                          ? "success"
                          : evidenceLevel === "Moderate"
                            ? "accent"
                            : "warning"
                      }
                    >
                      {evidenceLevel} evidence
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {symptomCounts.map(({ name, count }) => (
                      <Badge key={name} tone={count >= 2 ? "success" : "accent"}>
                        {name}
                        {count >= 2 && (
                          <span className="ml-1 text-[10px] font-semibold opacity-80">
                            {count}x
                          </span>
                        )}
                      </Badge>
                    ))}
                  </div>
                  {selectedCompounds.length >= 2 && symptomCounts.some((s) => s.count >= 2) && (
                    <p className="text-[11px] text-text-subtle mt-3 flex items-start gap-1.5">
                      <Sparkles className="w-3 h-3 mt-0.5 text-accent shrink-0" aria-hidden />
                      Symptoms marked 2x+ are reinforced by multiple compounds in your selection —
                      a sign of synergistic targeting.
                    </p>
                  )}
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Card tone="raised">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm text-success">Benefits</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {allBenefits.map((b) => (
                        <li
                          key={b}
                          className="text-xs text-text-muted flex items-start gap-1.5 leading-relaxed"
                        >
                          <span className="text-success mt-0.5 shrink-0">+</span>
                          {b}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>

                <Card tone="raised">
                  <CardHeader className="pb-1">
                    <CardTitle className="text-sm text-[color:var(--warning)]">
                      Considerations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-1.5">
                      {allRisks.map((r) => (
                        <li
                          key={r}
                          className="text-xs text-text-muted flex items-start gap-1.5 leading-relaxed"
                        >
                          <span className="text-[color:var(--warning)] mt-0.5 shrink-0">!</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              </div>

              {showShopCta && (
                <Link
                  href={shopHref}
                  prefetch={false}
                  aria-label={`Shop products matching ${selectedCompounds
                    .map((c) => c.name)
                    .join(", ")}`}
                  className="combo-shop-cta group relative flex items-center justify-between gap-3 rounded-2xl bg-accent px-5 py-3.5 text-white shadow-[0_8px_24px_-10px_rgba(58,133,96,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-10px_rgba(58,133,96,0.65)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <span className="flex items-center gap-2.5 min-w-0">
                    <span className="combo-shop-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
                      <ShoppingCart className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    </span>
                    <span className="flex flex-col min-w-0">
                      <span className="text-sm font-semibold leading-tight">
                        Shop this Profile
                      </span>
                      <span className="text-[11px] text-white/80 leading-tight truncate">
                        Curated products with{" "}
                        {selectedCompounds.map((c) => c.name).join(" + ")}
                      </span>
                    </span>
                  </span>
                  <ArrowRight
                    className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {showFooterCta && (
        <div className="text-center mt-8 sm:mt-10">
          <Link href="/portal/combo-wheel">
            <Button
              variant="secondary"
              size="lg"
              className="rounded-xl font-semibold w-full sm:w-auto"
            >
              Open the full Combo Wheel
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-4 py-5 text-center">
      <p className="text-sm text-[var(--ink)] leading-relaxed">
        Tap any segment of the wheel to begin.
      </p>
      <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
        Add a <span className="text-accent font-medium">second compound</span> to see
        the synergistic targets your combo unlocks.
      </p>
    </div>
  );
}

// Legend swatches below the wheel use one representative color per
// category. The wheel itself paints each slice with the compound's own
// `c.color` so every cannabinoid and every terpene is visually distinct
// (a Dr. Patel directive: the wheel must be colorful, not flat).
const CANNABINOID_LEGEND = "#2D8B5E";
const TERPENE_LEGEND = "#E8A838";

// ---------------------------------------------------------------------------
// Wheel geometry: outer ring = cannabinoids, inner ring = terpenes.
// Each segment is an annular wedge built from two arcs + two radial lines.
// ---------------------------------------------------------------------------

function Wheel({
  compounds,
  selected,
  onToggle,
  onReset,
  size,
}: {
  compounds: ComboWheelCompound[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onReset: () => void;
  size: "sm" | "lg";
}) {
  const VB = 440;
  const cx = VB / 2;
  const cy = VB / 2;
  const outerR = 210;
  const midR = 140;
  const innerR = 70;
  const hubR = 56;

  const cannabinoids = compounds.filter((c) => c.type === "cannabinoid");
  const terpenes = compounds.filter((c) => c.type === "terpene");

  // Touch fires before the synthesized click on mobile. Track the last touch
  // so the click handler can no-op and avoid double-toggling.
  const lastTouchRef = useRef<number>(0);

  const activate = (id: string) => {
    triggerHaptic(15);
    onToggle(id);
  };

  const handleTouchStart = (id: string) => {
    lastTouchRef.current = Date.now();
    activate(id);
  };

  const handleClick = (id: string) => {
    if (Date.now() - lastTouchRef.current < 600) return;
    activate(id);
  };

  const handleKey = (e: React.KeyboardEvent<SVGGElement>, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      activate(id);
    }
  };

  const annularWedge = (r1: number, r2: number, start: number, end: number) => {
    const x1 = cx + r1 * Math.cos(start);
    const y1 = cy + r1 * Math.sin(start);
    const x2 = cx + r2 * Math.cos(start);
    const y2 = cy + r2 * Math.sin(start);
    const x3 = cx + r2 * Math.cos(end);
    const y3 = cy + r2 * Math.sin(end);
    const x4 = cx + r1 * Math.cos(end);
    const y4 = cy + r1 * Math.sin(end);
    const largeArc = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} L ${x2} ${y2} A ${r2} ${r2} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${r1} ${r1} 0 ${largeArc} 0 ${x1} ${y1} Z`;
  };

  // hitSlop expands the tap target radially (and tightens the angular gap)
  // without changing the visible geometry. Used on the inner terpene ring
  // where small-screen segments are otherwise tough to fat-finger.
  const renderRing = (
    list: Compound[],
    r1: number,
    r2: number,
    gap: number,
    hitSlop = 0,
  ) =>
    list.map((c, i) => {
      const step = (2 * Math.PI) / list.length;
      const start = i * step - Math.PI / 2 + gap;
      const end = start + step - gap * 2;
      const isSelected = selected.has(c.id);

      const mid = (start + end) / 2;
      const labelR = (r1 + r2) / 2;
      const lx = cx + labelR * Math.cos(mid);
      const ly = cy + labelR * Math.sin(mid);
      const rot = (mid * 180) / Math.PI + 90;

      const d = annularWedge(r1, r2, start, end);
      // Selected slices expand outward 8px (and inward 4px on the inner ring)
      // so the user gets visual feedback that the wedge is "lifted off" the
      // wheel. Per EMR-369: clicking should make the slice bigger.
      const dExpanded = annularWedge(
        Math.max(r1 - 4, hubR + 4),
        r2 + 8,
        start,
        end,
      );
      const dHit =
        hitSlop > 0
          ? annularWedge(
              Math.max(r1 - hitSlop, hubR + 4),
              r2 + hitSlop,
              start - gap * 0.5,
              end + gap * 0.5,
            )
          : null;

      const stateLabel = isSelected
        ? `Deselect ${c.name}, ${c.type}, currently selected`
        : `Select ${c.name}, ${c.type}, currently unselected`;

      // EMR-201: each slice paints with its own compound color so the wheel
      // reads as a vibrant spectrum, not two flat bands. The category hue is
      // only used for the legend swatches below.
      const segColor = c.color;

      return (
        <g
          key={c.id}
          tabIndex={0}
          role="checkbox"
          aria-checked={isSelected}
          aria-label={stateLabel}
          onClick={() => handleClick(c.id)}
          onTouchStart={() => handleTouchStart(c.id)}
          onKeyDown={(e) => handleKey(e, c.id)}
          className="combo-segment"
          style={{ ["--seg-color" as string]: segColor }}
        >
          {dHit && (
            <path
              d={dHit}
              fill="transparent"
              className="combo-hitarea"
              aria-hidden
            />
          )}
          <path
            d={isSelected ? dExpanded : d}
            fill={segColor}
            opacity={1}
            stroke={isSelected ? "#fff" : "rgba(255,255,255,0.5)"}
            strokeWidth={isSelected ? 3 : 1.25}
            className="combo-visible"
            style={{
              transition: "d 240ms ease, stroke-width 200ms ease, filter 300ms ease",
              filter: isSelected
                ? `drop-shadow(0 0 10px ${segColor}) drop-shadow(0 0 22px ${segColor}cc)`
                : `drop-shadow(0 1px 2px ${segColor}55)`,
              pointerEvents: dHit ? "none" : undefined,
            }}
          />
          <text
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#fff"
            // EMR-201: larger, bolder labels so compound names read clearly
            // even on the inner terpene ring.
            fontSize={c.name.length > 8 ? 17 : 21}
            fontWeight={800}
            transform={`rotate(${rot} ${lx} ${ly})`}
            style={{
              pointerEvents: "none",
              letterSpacing: 0.5,
              textShadow: "0 1px 5px rgba(0,0,0,0.65), 0 0 2px rgba(0,0,0,0.4)",
            }}
          >
            {c.name}
          </text>
        </g>
      );
    });

  // EMR-369: bumped the lg max width to fill the available column rather
  // than floating in dead space. The viewBox is fixed (440), so the SVG
  // simply scales up — labels grow proportionally.
  // EMR-201: bumped again so the wheel is the unmistakable centerpiece of
  // the surface and the larger labels have room to breathe.
  const widthClass =
    size === "lg"
      ? "w-full max-w-[760px] min-w-[360px]"
      : "w-full max-w-[460px] min-w-[300px]";

  return (
    <div className={cn("relative mx-auto", widthClass)}>
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="w-full h-auto select-none"
        role="group"
        aria-label="Cannabis Combo Wheel — cannabinoids and terpenes"
        aria-describedby="combo-wheel-instructions"
      >
        <desc id="combo-wheel-instructions">
          Outer ring lists six cannabinoids; inner ring lists six terpenes. Tap
          any segment to add or remove it from your combo. Use Tab to move
          between segments and Space or Enter to toggle.
        </desc>
        <style>{`
          .combo-segment {
            cursor: pointer;
            outline: none;
            transform-origin: ${cx}px ${cy}px;
            -webkit-tap-highlight-color: transparent;
            touch-action: manipulation;
          }
          .combo-segment:hover .combo-visible { opacity: 1 !important; filter: brightness(1.15) drop-shadow(0 0 6px var(--seg-color)) !important; }
          .combo-segment[aria-checked="true"] { animation: combo-pulse 600ms ease-out; }
          .combo-segment:focus-visible .combo-visible { stroke: var(--seg-color); stroke-width: 3; filter: drop-shadow(0 0 10px var(--seg-color)); }
          @keyframes combo-pulse {
            0% { transform: scale(1); }
            45% { transform: scale(1.02); }
            100% { transform: scale(1); }
          }
          .combo-shop-icon { animation: combo-cart-idle 4.5s ease-in-out infinite; }
          .combo-shop-cta:hover .combo-shop-icon { animation: combo-cart-bump 700ms ease-out; }
          @keyframes combo-cart-idle {
            0%, 88%, 100% { transform: translateX(0) rotate(0deg); }
            92% { transform: translateX(-1px) rotate(-4deg); }
            96% { transform: translateX(1px) rotate(4deg); }
          }
          @keyframes combo-cart-bump {
            0% { transform: translateX(0) rotate(0deg); }
            30% { transform: translateX(-2px) rotate(-8deg); }
            60% { transform: translateX(3px) rotate(6deg); }
            100% { transform: translateX(0) rotate(0deg); }
          }
          @media (prefers-reduced-motion: reduce) {
            .combo-shop-icon,
            .combo-shop-cta:hover .combo-shop-icon { animation: none; }
          }
        `}</style>

        <defs>
          <radialGradient id="combo-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#4FA77B" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#4FA77B" stopOpacity="0.1" />
            <stop offset="100%" stopColor="#4FA77B" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="combo-hub" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="var(--surface-raised)" />
            <stop offset="100%" stopColor="var(--surface)" />
          </radialGradient>
          <filter id="combo-glow-filter" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <circle cx={cx} cy={cy} r={outerR + 12} fill="url(#combo-glow)" />

        {renderRing(cannabinoids, midR + 4, outerR, 0.012)}
        {renderRing(terpenes, innerR + 4, midR - 4, 0.014, 8)}

        <circle
          cx={cx}
          cy={cy}
          r={midR + 1}
          fill="none"
          stroke="var(--border)"
          strokeOpacity={0.5}
          strokeWidth={0.75}
        />
        <circle cx={cx} cy={cy} r={innerR + 2} fill="url(#combo-hub)" />
        {/* EMR-369: hub doubles as a "reset selection" button when one or
            more segments are picked. The styling stays decorative; the
            cursor + label flip when there's something to clear. */}
        <g
          role={selected.size > 0 ? "button" : undefined}
          aria-label={selected.size > 0 ? "Reset combo selection" : undefined}
          tabIndex={selected.size > 0 ? 0 : -1}
          onClick={() => {
            if (selected.size === 0) return;
            triggerHaptic([10, 20, 10]);
            onReset();
          }}
          onKeyDown={(e) => {
            if (selected.size === 0) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              triggerHaptic([10, 20, 10]);
              onReset();
            }
          }}
          style={{ cursor: selected.size > 0 ? "pointer" : "default", outline: "none" }}
        >
          <circle
            cx={cx}
            cy={cy}
            r={hubR}
            fill="var(--surface-raised)"
            stroke={selected.size > 0 ? "var(--accent)" : "var(--border)"}
            strokeWidth={selected.size > 0 ? 1.5 : 1}
            style={{ transition: "stroke 200ms ease, stroke-width 200ms ease" }}
          />

          <text
            x={cx}
            y={cy - 14}
            textAnchor="middle"
            fill="var(--accent)"
            fontSize={10}
            fontWeight={600}
            letterSpacing={1.5}
            style={{ textTransform: "uppercase", pointerEvents: "none" }}
          >
            Combo Wheel
          </text>
          <text
            x={cx}
            y={cy + 5}
            textAnchor="middle"
            fill="var(--text)"
            fontSize={selected.size === 0 ? 14 : 20}
            fontWeight={600}
            fontFamily="var(--font-display, serif)"
            style={{ pointerEvents: "none" }}
          >
            {selected.size === 0 ? "Select compounds" : `${selected.size} selected`}
          </text>
          <text
            x={cx}
            y={cy + 24}
            textAnchor="middle"
            fill={selected.size > 0 ? "var(--accent)" : "var(--text-muted)"}
            fontSize={10}
            fontWeight={selected.size > 0 ? 600 : 400}
            style={{ pointerEvents: "none" }}
          >
            {selected.size === 0
              ? "Tap any segment"
              : "Tap center to reset"}
          </text>
        </g>
      </svg>

      {/* EMR-201: slices are now per-compound colors, so the legend marks
          ring position (outer/inner) with vibrant gradient pills rather than
          a single flat hue — each compound owns its own color on the wheel. */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-semibold text-text-muted">
        <span className="inline-flex items-center gap-2">
          <span
            className="h-3 w-7 rounded-full shadow-sm"
            style={{
              background: `linear-gradient(90deg, ${CANNABINOID_LEGEND}, #5FDBAA, #85FFE3)`,
            }}
            aria-hidden
          />
          Outer ring · Cannabinoids
        </span>
        <span className="inline-flex items-center gap-2">
          <span
            className="h-3 w-7 rounded-full shadow-sm"
            style={{
              background: `linear-gradient(90deg, ${TERPENE_LEGEND}, #FFD877, #FFF8A1)`,
            }}
            aria-hidden
          />
          Inner ring · Terpenes
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Skeleton wheel — placeholder shown while compound data is loading. Mirrors
// the real wheel's geometry (outer ring, inner ring, hub) so the layout
// never shifts when data resolves. Two concentric rings of muted segments
// counter-rotate to signal liveness without drawing focus.
// ---------------------------------------------------------------------------

function SkeletonWheel({
  size,
  error,
}: {
  size: "sm" | "lg";
  error: string | null;
}) {
  const VB = 440;
  const cx = VB / 2;
  const cy = VB / 2;
  const outerR = 210;
  const midR = 140;
  const innerR = 70;
  const hubR = 56;
  const OUTER_SEGMENTS = 6;
  const INNER_SEGMENTS = 6;

  const ringPath = (count: number, r1: number, r2: number, gap: number, i: number) => {
    const step = (2 * Math.PI) / count;
    const start = i * step - Math.PI / 2 + gap;
    const end = start + step - gap * 2;
    const x1 = cx + r1 * Math.cos(start);
    const y1 = cy + r1 * Math.sin(start);
    const x2 = cx + r2 * Math.cos(start);
    const y2 = cy + r2 * Math.sin(start);
    const x3 = cx + r2 * Math.cos(end);
    const y3 = cy + r2 * Math.sin(end);
    const x4 = cx + r1 * Math.cos(end);
    const y4 = cy + r1 * Math.sin(end);
    const largeArc = end - start > Math.PI ? 1 : 0;
    return `M ${x1} ${y1} L ${x2} ${y2} A ${r2} ${r2} 0 ${largeArc} 1 ${x3} ${y3} L ${x4} ${y4} A ${r1} ${r1} 0 ${largeArc} 0 ${x1} ${y1} Z`;
  };

  const widthClass =
    size === "lg"
      ? "w-full max-w-[440px] min-w-[300px]"
      : "w-full max-w-[320px] min-w-[260px]";

  return (
    <div
      className={cn("relative mx-auto", widthClass)}
      role="status"
      aria-live="polite"
      aria-label={error ?? "Loading Combo Wheel"}
    >
      <svg viewBox={`0 0 ${VB} ${VB}`} className="w-full h-auto select-none">
        <style>{`
          @keyframes combo-skeleton-spin { to { transform: rotate(360deg); } }
          @keyframes combo-skeleton-pulse {
            0%, 100% { opacity: 0.45; }
            50%      { opacity: 0.85; }
          }
          .combo-skeleton-ring {
            transform-origin: ${cx}px ${cy}px;
            animation: combo-skeleton-spin 12s linear infinite;
          }
          .combo-skeleton-ring--rev {
            animation-direction: reverse;
            animation-duration: 16s;
          }
          .combo-skeleton-seg {
            fill: var(--surface-muted);
            stroke: var(--border);
            stroke-width: 0.75;
            animation: combo-skeleton-pulse 1.6s ease-in-out infinite;
          }
          @media (prefers-reduced-motion: reduce) {
            .combo-skeleton-ring,
            .combo-skeleton-seg { animation: none; }
          }
        `}</style>

        <circle
          cx={cx}
          cy={cy}
          r={outerR + 12}
          fill="var(--surface-muted)"
          opacity={0.35}
        />

        <g className="combo-skeleton-ring">
          {Array.from({ length: OUTER_SEGMENTS }).map((_, i) => (
            <path
              key={`outer-${i}`}
              d={ringPath(OUTER_SEGMENTS, midR + 4, outerR, 0.02, i)}
              className="combo-skeleton-seg"
              style={{ animationDelay: `${i * 120}ms` }}
            />
          ))}
        </g>

        <g className="combo-skeleton-ring combo-skeleton-ring--rev">
          {Array.from({ length: INNER_SEGMENTS }).map((_, i) => (
            <path
              key={`inner-${i}`}
              d={ringPath(INNER_SEGMENTS, innerR + 4, midR - 4, 0.024, i)}
              className="combo-skeleton-seg"
              style={{ animationDelay: `${i * 140 + 60}ms` }}
            />
          ))}
        </g>

        <circle
          cx={cx}
          cy={cy}
          r={hubR}
          fill="var(--surface-raised)"
          stroke="var(--border)"
          strokeWidth={1}
        />

        <text
          x={cx}
          y={cy + 4}
          textAnchor="middle"
          fill="var(--text-muted)"
          fontSize={11}
          fontWeight={500}
        >
          {error ? "Couldn't load" : "Loading…"}
        </text>
      </svg>

      <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-surface-muted" aria-hidden />
          Cannabinoids
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-4 rounded-full bg-surface-muted" aria-hidden />
          Terpenes
        </span>
      </div>
    </div>
  );
}
