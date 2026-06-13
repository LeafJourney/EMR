"use client";

import { useState, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeafSprig, EditorialRule, Eyebrow } from "@/components/ui/ornament";
import { Tabs, TabList, Trigger, Panel } from "@/components/ui/tabs";
import {
  CANNABINOIDS,
  TERPENES,
  DELIVERY_METHODS,
  CONDITION_GUIDES,
  searchEducationDatabase,
  type SearchResult,
} from "@/lib/domain/cannabis-education";

// ---------------------------------------------------------------------------
// EMR-20 + EMR-78: Enhanced Educational Library + Cannabis Education Database
// ---------------------------------------------------------------------------

type Tab = "conditions" | "cannabinoids" | "terpenes" | "delivery";

const EVIDENCE_TONE: Record<string, "success" | "info" | "warning" | "neutral"> = {
  strong: "success",
  moderate: "info",
  emerging: "warning",
  anecdotal: "neutral",
};

const TAB_VALUES: readonly Tab[] = ["conditions", "cannabinoids", "terpenes", "delivery"];

function parseTab(raw: string | null): Tab | null {
  if (!raw) return null;
  return (TAB_VALUES as readonly string[]).includes(raw) ? (raw as Tab) : null;
}

export default function LearnPage() {
  const searchParams = useSearchParams();
  const initialTab = parseTab(searchParams.get("tab")) ?? "conditions";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");
  // Note: deep-link sync between Education hub tabs and this page is
  // handled by the Tabs primitive via `urlParam="tab"` below — no manual
  // useEffect reconciliation needed.

  const searchResults = useMemo(() => {
    if (search.length < 2) return null;
    return searchEducationDatabase(search);
  }, [search]);

  return (
    <PageShell maxWidth="max-w-[960px]">
      <PatientSectionNav section="chatLearn" />

      <div className="mb-8">
        <Eyebrow className="mb-3">Educational Library</Eyebrow>
        <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
          Learn about your care
        </h1>
        <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-2xl">
          Everything you need to know about cannabis medicine — cannabinoids,
          terpenes, delivery methods, and condition-specific guidance. Written
          in plain language.
        </p>
      </div>

      {/* ── Hero card ──────────────────────────────── */}
      <Card tone="ambient" className="mb-8 p-8 md:p-10">
        <div className="relative z-10 flex flex-col items-center text-center">
          <LeafSprig size={36} className="text-accent mb-4" />
          <h2 className="font-display text-2xl md:text-3xl text-text tracking-tight leading-tight mb-3">
            Knowledge is part of healing
          </h2>
          <p className="text-sm text-text-muted max-w-lg leading-relaxed mb-6">
            The more you understand about how cannabis medicine works with your
            body, the more confident you will feel about your care plan.
          </p>

          {/* Search */}
          <div className="w-full max-w-md">
            <input
              type="text"
              placeholder="Search conditions, cannabinoids, terpenes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-border bg-surface text-sm text-text placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>
        </div>
      </Card>

      {/* ── Search results ─────────────────────────── */}
      {searchResults && searchResults.length > 0 && (
        <div className="mb-8 space-y-3">
          <p className="text-sm text-text-muted">
            {searchResults.length} result{searchResults.length !== 1 ? "s" : ""} for &ldquo;{search}&rdquo;
          </p>
          {searchResults.map((r, i) => (
            <Card key={i} tone="raised">
              <CardContent className="py-4 px-5">
                <div className="flex items-start gap-3">
                  <span className="text-xl">{r.emoji}</span>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-display text-base text-text">{r.name}</span>
                      <Badge tone="neutral" className="text-[10px]">{r.type}</Badge>
                    </div>
                    <p className="text-sm text-text-muted">{r.snippet}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          <EditorialRule className="my-6" />
        </div>
      )}

      {searchResults && searchResults.length === 0 && search.length >= 2 && (
        <div className="mb-8 text-center py-6">
          <p className="text-sm text-text-muted">No results for &ldquo;{search}&rdquo;. Try a different term.</p>
        </div>
      )}

      {/* ── Tab bar ────────────────────────────────── */}
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        urlParam="tab"
      >
        <TabList aria-label="Educational library sections" className="mb-8 overflow-x-auto">
          {([
            { key: "conditions" as Tab, label: "By Condition", count: CONDITION_GUIDES.length },
            { key: "cannabinoids" as Tab, label: "Cannabinoids", count: CANNABINOIDS.length },
            { key: "terpenes" as Tab, label: "Terpenes", count: TERPENES.length },
            { key: "delivery" as Tab, label: "Delivery Methods", count: DELIVERY_METHODS.length },
          ]).map((t) => (
            <Trigger key={t.key} value={t.key}>
              {t.label}
              <span className="ml-1.5 text-xs text-text-subtle">{t.count}</span>
            </Trigger>
          ))}
        </TabList>

      {/* ── Condition guides ───────────────────────── */}
      <Panel value="conditions">
        <div className="space-y-5">
          {CONDITION_GUIDES.map((g) => (
            <Card key={g.condition} tone="raised">
              <CardContent className="py-6 px-5 md:px-6">
                <div className="flex items-start gap-4 mb-4">
                  <span className="text-3xl">{g.emoji}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-xl text-text tracking-tight">{g.condition}</h3>
                      <Badge tone={EVIDENCE_TONE[g.evidence] ?? "neutral"}>
                        {g.evidence} evidence
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="rounded-lg bg-accent-soft/40 border border-accent/10 px-4 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-accent mb-2">
                      Recommended cannabinoids
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.recommendedCannabinoids.map((c) => (
                        <Badge key={c} tone="accent">{c}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg bg-highlight-soft/40 border border-highlight/10 px-4 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--highlight-hover)] mb-2">
                      Recommended terpenes
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.recommendedTerpenes.map((t) => (
                        <Badge key={t} tone="neutral">{t}</Badge>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-lg bg-surface-muted/60 border border-border/50 px-4 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-2">
                      Preferred delivery
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {g.preferredDelivery.map((d) => (
                        <Badge key={d} tone="neutral">{d.split(" (")[0]}</Badge>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-4 pl-4 border-l-2 border-accent/25">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-1">Dosing guidance</p>
                  <p className="text-sm text-text-muted">{g.dosingNote}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </Panel>

      {/* ── Cannabinoids ───────────────────────────── */}
      <Panel value="cannabinoids" lazy>
        <div className="space-y-5">
          {CANNABINOIDS.map((c) => (
            <Card key={c.name} tone="raised">
              <CardContent className="py-6 px-5 md:px-6">
                <div className="flex items-start gap-4 mb-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-2xl">{c.emoji}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-xl text-text tracking-tight">{c.name} ({c.abbreviation})</h3>
                      <Badge tone={c.psychoactive ? "warning" : "success"}>
                        {c.psychoactive ? "Psychoactive" : "Non-psychoactive"}
                      </Badge>
                      <Badge tone={EVIDENCE_TONE[c.evidence] ?? "neutral"}>{c.evidence}</Badge>
                    </div>
                    <p className="text-sm text-text-muted mt-1">{c.simpleDescription}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {c.benefits.map((b) => (
                    <Badge key={b} tone="accent">{b}</Badge>
                  ))}
                </div>
                <p className="text-xs text-text-subtle">Typical dose: {c.typicalDoseRange}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Panel>

      {/* ── Terpenes ───────────────────────────────── */}
      <Panel value="terpenes" lazy>
        <div className="space-y-5">
          {TERPENES.map((t) => (
            <Card key={t.name} tone="raised">
              <CardContent className="py-6 px-5 md:px-6">
                <div className="flex items-start gap-4 mb-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-highlight-soft text-2xl">{t.emoji}</span>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-display text-xl text-text tracking-tight">{t.name}</h3>
                      <Badge tone={EVIDENCE_TONE[t.evidence] ?? "neutral"}>{t.evidence}</Badge>
                    </div>
                    <p className="text-sm text-text-muted mt-1">{t.aroma}</p>
                  </div>
                </div>
                <p className="text-sm text-text-muted mb-3">{t.simpleDescription}</p>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {t.effects.map((e) => (
                    <Badge key={e} tone="neutral">{e}</Badge>
                  ))}
                </div>
                <p className="text-xs text-text-subtle">Also found in: {t.foundIn.join(", ")}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </Panel>

      {/* ── Delivery methods ───────────────────────── */}
      <Panel value="delivery" lazy>
        <div className="space-y-5">
          {DELIVERY_METHODS.map((d) => (
            <Card key={d.name} tone="raised">
              <CardContent className="py-6 px-5 md:px-6">
                <div className="flex items-start gap-4 mb-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-muted text-2xl">{d.emoji}</span>
                  <div>
                    <h3 className="font-display text-xl text-text tracking-tight">{d.name}</h3>
                    <p className="text-sm text-text-muted mt-1">{d.simpleDescription}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  <div className="rounded-lg bg-accent-soft/40 border border-accent/10 px-3 py-2 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-accent mb-0.5">Onset</p>
                    <p className="text-sm font-display text-text">{d.onset}</p>
                  </div>
                  <div className="rounded-lg bg-highlight-soft/40 border border-highlight/10 px-3 py-2 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--highlight-hover)] mb-0.5">Duration</p>
                    <p className="text-sm font-display text-text">{d.duration}</p>
                  </div>
                  <div className="rounded-lg bg-surface-muted/60 border border-border/50 px-3 py-2 text-center">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle mb-0.5">Absorption</p>
                    <p className="text-sm font-display text-text">{d.bioavailability}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle">Best for</p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.bestFor.map((b) => (
                      <Badge key={b} tone="accent">{b}</Badge>
                    ))}
                  </div>
                </div>

                {d.cautions.length > 0 && (
                  <div className="mt-3 rounded-lg bg-[#B83B2E]/5 border border-[#B83B2E]/10 px-4 py-3">
                    <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#B83B2E] mb-1">Good to know</p>
                    <ul className="space-y-1">
                      {d.cautions.map((c, i) => (
                        <li key={i} className="text-xs text-text-muted flex items-start gap-1.5">
                          <span className="text-[#B83B2E] mt-0.5 shrink-0">&bull;</span>
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      </Panel>
      </Tabs>

      {/* ── Disclaimer ─────────────────────────────── */}
      <div className="mt-12 mb-4 text-center">
        <p className="text-xs text-text-subtle max-w-md mx-auto leading-relaxed">
          This educational content is based on current research and clinical
          experience. Always follow your care team&apos;s specific guidance for your
          treatment plan.
        </p>
        <LeafSprig size={28} className="text-accent/40 mx-auto mt-6" />
      </div>
    </PageShell>
  );
}
