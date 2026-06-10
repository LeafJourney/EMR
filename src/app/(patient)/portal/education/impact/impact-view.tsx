"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";
import {
  TrendingUp,
  Scale,
  HeartPulse,
  DollarSign,
  BookOpen,
  Info,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import type { ImpactData } from "./impact-data";

// ---------------------------------------------------------------------------
// Count-up hook — animates 0 → target once the element scrolls into view.
// Respects prefers-reduced-motion by snapping straight to the final value.
// ---------------------------------------------------------------------------
function useCountUp(target: number, duration = 1100): [number, React.RefObject<HTMLDivElement>] {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReduced) {
      setValue(target);
      return;
    }

    const run = () => {
      if (started.current) return;
      started.current = true;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        // ease-out cubic
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(target * eased);
        if (t < 1) requestAnimationFrame(tick);
        else setValue(target);
      };
      requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            run();
            observer.disconnect();
          }
        }
      },
      { threshold: 0.35 }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [target, duration]);

  return [value, ref];
}

function formatNumber(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

// ---------------------------------------------------------------------------
// Source footnote — tiny cited text under any stat.
// ---------------------------------------------------------------------------
function SourceNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-text-subtle">{children}</p>
  );
}

// ---------------------------------------------------------------------------
// Big animated stat — count-up number with prefix/suffix.
// ---------------------------------------------------------------------------
function BigNumber({
  value,
  prefix,
  suffix,
  className,
}: {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const [animated, ref] = useCountUp(value);
  return (
    <div ref={ref} className={className}>
      <span className="font-display tracking-tight tabular-nums text-text">
        {prefix}
        {formatNumber(animated)}
        {suffix}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main view
// ---------------------------------------------------------------------------
export function ImpactView({ data }: { data: ImpactData }) {
  const { outcomes, economics, harmReduction, comparison, disclaimer } = data;

  const sliceTone: Record<string, { token: string; mix: string }> = {
    success: { token: "var(--success)", mix: "color-mix(in srgb, var(--success) 70%, transparent)" },
    danger: { token: "var(--danger)", mix: "color-mix(in srgb, var(--danger) 65%, transparent)" },
    neutral: { token: "var(--text-subtle)", mix: "color-mix(in srgb, var(--text-subtle) 55%, transparent)" },
  };

  return (
    <div className="space-y-16">
      {/* ===== 1. OUTCOMES CLASSIFICATION ================================== */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-4 w-4 text-accent" aria-hidden />
          <Eyebrow>What the research says</Eyebrow>
        </div>
        <h2 className="font-display text-2xl md:text-3xl text-text tracking-tight">
          {formatNumber(outcomes.totalPairs)} cannabinoid–condition pairs, classified
        </h2>
        <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-2xl">
          Mirroring the Medical Cannabis Library framework, more than{" "}
          {formatNumber(outcomes.totalAbstracts)} PubMed abstracts were mined and
          every cannabinoid–disease relationship was labeled positive, negative,
          or neutral.
        </p>

        {/* Three stat cards */}
        <div className="grid gap-4 sm:grid-cols-3 mt-7">
          {outcomes.slices.map((slice) => {
            const pct = (slice.count / outcomes.totalPairs) * 100;
            const tone = sliceTone[slice.tone];
            return (
              <Card key={slice.label} tone="glass" motion="hover" className="p-5">
                <CardContent className="p-0">
                  <div className="flex items-center justify-between">
                    <span className="text-2xl" aria-hidden>
                      {slice.emoji}
                    </span>
                    <Badge
                      tone={
                        slice.tone === "success"
                          ? "success"
                          : slice.tone === "danger"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {pct.toFixed(1)}%
                    </Badge>
                  </div>
                  <BigNumber
                    value={slice.count}
                    className="mt-4 text-3xl md:text-4xl"
                  />
                  <p className="mt-1 text-sm font-medium text-text">{slice.label}</p>
                  {/* progress bar */}
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full transition-[width] duration-700 ease-out"
                      style={{ width: `${pct}%`, backgroundColor: tone.mix }}
                    />
                  </div>
                  <p className="mt-3 text-[12px] leading-relaxed text-text-muted">
                    {slice.blurb}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Stacked bar */}
        <div className="mt-6">
          <div className="flex h-4 w-full overflow-hidden rounded-full bg-surface-muted">
            {outcomes.slices.map((slice) => {
              const pct = (slice.count / outcomes.totalPairs) * 100;
              return (
                <div
                  key={slice.label}
                  className="h-full"
                  style={{ width: `${pct}%`, backgroundColor: sliceTone[slice.tone].mix }}
                  title={`${slice.label}: ${pct.toFixed(1)}%`}
                />
              );
            })}
          </div>
        </div>

        {/* Takeaway */}
        <Card tone="ambient" className="mt-6 p-5">
          <CardContent className="p-0">
            <p className="text-sm leading-relaxed text-text">
              <span className="mr-1" aria-hidden>
                📊
              </span>
              {outcomes.takeaway}
            </p>
            <SourceNote>
              Source: {outcomes.source} ·{" "}
              <a
                href={`https://doi.org/${outcomes.doi}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-accent hover:underline"
              >
                DOI: {outcomes.doi}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            </SourceNote>
          </CardContent>
        </Card>
      </section>

      <EditorialRule />

      {/* ===== 2. ECONOMIC IMPACT ========================================= */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-accent" aria-hidden />
          <Eyebrow>Economic footprint</Eyebrow>
        </div>
        <h2 className="font-display text-2xl md:text-3xl text-text tracking-tight">
          A multi-billion-dollar legal economy
        </h2>
        <div className="grid gap-4 sm:grid-cols-3 mt-7">
          {economics.map((stat) => (
            <Card key={stat.label} tone="raised" motion="hover" className="p-6">
              <CardContent className="p-0">
                <span className="text-2xl" aria-hidden>
                  {stat.emoji}
                </span>
                <BigNumber
                  value={stat.value}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  className="mt-4 text-4xl md:text-5xl"
                />
                <p className="mt-2 text-sm font-semibold text-text">{stat.label}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
                  {stat.detail}
                </p>
                <SourceNote>{stat.source}</SourceNote>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <EditorialRule />

      {/* ===== 3. LIVES SAVED / HARM REDUCTION ============================ */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <HeartPulse className="h-4 w-4 text-accent" aria-hidden />
          <Eyebrow>Harm reduction</Eyebrow>
        </div>
        <h2 className="font-display text-2xl md:text-3xl text-text tracking-tight">
          Safer pathways, fewer harms
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 mt-7">
          {harmReduction.headline.map((stat) => (
            <Card key={stat.label} tone="glassStrong" motion="hover" className="p-6">
              <CardContent className="p-0">
                <div className="flex items-start gap-4">
                  <span className="text-3xl" aria-hidden>
                    {stat.emoji}
                  </span>
                  <div className="min-w-0">
                    <BigNumber
                      value={stat.value}
                      prefix={stat.prefix}
                      suffix={stat.suffix}
                      className="text-4xl md:text-5xl"
                    />
                    <p className="mt-2 text-sm font-semibold text-text">
                      {stat.label}
                    </p>
                    <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
                      {stat.detail}
                    </p>
                    <SourceNote>{stat.source}</SourceNote>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
        <Card tone="ambient" className="mt-5 p-5">
          <CardContent className="p-0 flex gap-3">
            <Info className="h-4 w-4 shrink-0 text-text-muted mt-0.5" aria-hidden />
            <div>
              <p className="text-[13px] leading-relaxed text-text-muted">
                {harmReduction.note}
              </p>
              <SourceNote>{harmReduction.source}</SourceNote>
            </div>
          </CardContent>
        </Card>
      </section>

      <EditorialRule />

      {/* ===== 4. COMPARISON VS ALCOHOL & PHARMA ========================== */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Scale className="h-4 w-4 text-accent" aria-hidden />
          <Eyebrow>Make it make sense</Eyebrow>
        </div>
        <h2 className="font-display text-2xl md:text-3xl text-text tracking-tight">
          Cannabis vs. alcohol &amp; opioids
        </h2>
        <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-2xl">
          We accept alcohol and prescription opioids as everyday parts of life.
          Set their risk profiles side by side and the contrast is worth a second
          thought.
        </p>

        <Card tone="glass" className="mt-7 overflow-hidden p-0">
          <CardContent className="p-0">
            {/* header row */}
            <div className="hidden sm:grid grid-cols-4 gap-4 border-b border-border bg-surface-muted/60 px-5 py-3 text-[12px] font-semibold uppercase tracking-wide text-text-subtle">
              <span>Dimension</span>
              <span>🍷 Alcohol</span>
              <span>💊 Opioids / Rx</span>
              <span className="text-success">🌿 Cannabis</span>
            </div>
            <div className="divide-y divide-border">
              {comparison.rows.map((row) => (
                <div
                  key={row.dimension}
                  className="grid grid-cols-1 sm:grid-cols-4 gap-2 sm:gap-4 px-5 py-4"
                >
                  <div className="text-sm font-semibold text-text">
                    {row.dimension}
                  </div>
                  <div className="text-[13px] leading-relaxed text-text-muted">
                    <span className="sm:hidden font-medium text-text-subtle">
                      Alcohol:{" "}
                    </span>
                    {row.alcohol}
                  </div>
                  <div className="text-[13px] leading-relaxed text-text-muted">
                    <span className="sm:hidden font-medium text-text-subtle">
                      Opioids/Rx:{" "}
                    </span>
                    {row.pharma}
                  </div>
                  <div className="rounded-lg bg-accent-soft px-3 py-2 text-[13px] leading-relaxed text-text">
                    <span className="sm:hidden font-medium text-success">
                      Cannabis:{" "}
                    </span>
                    {row.cannabis}
                  </div>
                  <p className="col-span-full text-[11px] leading-relaxed text-text-subtle">
                    Source: {row.source}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        <SourceNote>{comparison.note}</SourceNote>
      </section>

      <EditorialRule />

      {/* ===== 5. EDUCATIONAL DISCLAIMER ================================== */}
      <section>
        <Card tone="outlined" className="p-6">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-text-muted" aria-hidden />
              <Badge tone="warning">Educational only</Badge>
            </div>
            <h2 className="font-display text-xl text-text tracking-tight">
              {disclaimer.title}
            </h2>
            <ul className="mt-4 space-y-2.5">
              {disclaimer.points.map((point) => (
                <li
                  key={point}
                  className="flex gap-3 text-[13px] leading-relaxed text-text-muted"
                >
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent"
                    aria-hidden
                  />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
