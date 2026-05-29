"use client";

// EMR-151 — Symptom/Diagnosis Supplement Combo Wheel.
//
// Rather than rebuild a second SVG annular ring, this wheel uses a
// radial chip layout: supplements arranged by category, tap to add
// to the combo, with the same symptom-overlap insight panel as the
// cannabis wheel. Keeps implementation tight while still giving
// patients a "wheel" feel.

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Star,
  StarHalf,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Eyebrow, LeafSprig } from "@/components/ui/ornament";
import {
  starBreakdown,
  symptomOverlap,
  type ResearchArticle,
  type SupplementCompoundView,
} from "@/lib/domain/supplement-wheel";

/** 1–5 star strength-of-evidence indicator (EMR-151). */
function Stars({ rating }: { rating: number }) {
  const { full, half, empty } = starBreakdown(rating);
  return (
    <span
      className="inline-flex items-center gap-0.5 text-amber-500"
      aria-label={`${rating} out of 5 evidence rating`}
      title={`${rating}/5 evidence rating`}
    >
      {Array.from({ length: full }).map((_, i) => (
        <Star key={`f${i}`} className="h-3.5 w-3.5 fill-current" aria-hidden />
      ))}
      {half === 1 && <StarHalf className="h-3.5 w-3.5 fill-current" aria-hidden />}
      {Array.from({ length: empty }).map((_, i) => (
        <Star key={`e${i}`} className="h-3.5 w-3.5 text-amber-500/25" aria-hidden />
      ))}
    </span>
  );
}

interface Props {
  compounds: SupplementCompoundView[];
  // EMR-151: marks the host surface so the Leafmart "Shop this stack"
  // CTA is hidden in clinical contexts where commerce should stay
  // out of the way (e.g. clinician-facing previews).
  context?: "patient" | "leafmart" | "clinical";
}

export function SupplementWheel({ compounds, context = "patient" }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // EMR-151 — external journal links open behind a "discuss with your
  // provider" disclaimer. We stash the pending article until the patient
  // acknowledges, then open it in a new tab.
  const [pendingArticle, setPendingArticle] = useState<ResearchArticle | null>(
    null,
  );

  const confirmOpenArticle = () => {
    if (pendingArticle && typeof window !== "undefined") {
      window.open(pendingArticle.url, "_blank", "noopener,noreferrer");
    }
    setPendingArticle(null);
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedRows = useMemo(
    () => compounds.filter((c) => selected.has(c.id)),
    [compounds, selected],
  );

  const overlaps = useMemo(() => symptomOverlap(selectedRows), [selectedRows]);

  const allBenefits = useMemo(
    () => Array.from(new Set(selectedRows.flatMap((c) => c.benefits))),
    [selectedRows],
  );
  const allRisks = useMemo(
    () => Array.from(new Set(selectedRows.flatMap((c) => c.risks))),
    [selectedRows],
  );

  const categories = useMemo(() => {
    const map = new Map<string, SupplementCompoundView[]>();
    for (const c of compounds) {
      const arr = map.get(c.category) ?? [];
      arr.push(c);
      map.set(c.category, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [compounds]);

  const evidenceLevel: "Strong" | "Moderate" | "Emerging" = useMemo(() => {
    if (selectedRows.some((c) => c.evidence === "strong")) return "Strong";
    if (selectedRows.some((c) => c.evidence === "moderate")) return "Moderate";
    return "Emerging";
  }, [selectedRows]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
      <Card tone="raised" className="p-5 sm:p-7">
        <div className="space-y-5">
          {categories.map(([cat, items]) => (
            <div key={cat}>
              <Eyebrow className="mb-2">{cat}</Eyebrow>
              <div className="flex flex-wrap gap-2">
                {items.map((c) => {
                  const isOn = selected.has(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggle(c.id)}
                      aria-pressed={isOn}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-transform hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
                      style={{
                        backgroundColor: isOn ? c.color : "transparent",
                        color: isOn ? "#fff" : "var(--text)",
                        border: `1.5px solid ${c.color}`,
                        boxShadow: isOn ? `0 4px 14px -4px ${c.color}66` : undefined,
                      }}
                    >
                      <span
                        className="h-1.5 w-1.5 rounded-full"
                        aria-hidden
                        style={{ backgroundColor: isOn ? "rgba(255,255,255,0.7)" : c.color }}
                      />
                      {c.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="space-y-4">
        <Card tone="raised">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <LeafSprig size={14} className="text-accent" />
              Your stack
            </CardTitle>
            <CardDescription>
              {selectedRows.length === 0
                ? "Tap a supplement to start a stack — add a second to see overlap."
                : `${selectedRows.length} supplement${selectedRows.length === 1 ? "" : "s"} in this stack`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-surface/60 px-4 py-5 text-center">
                <p className="text-sm text-text">Pick a starting supplement.</p>
                <p className="text-xs text-text-muted mt-1">
                  Add a second to see shared targets.
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {selectedRows.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface/60 px-3 py-2"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        aria-hidden
                        style={{ backgroundColor: c.color }}
                      />
                      <span className="text-sm text-text truncate">{c.name}</span>
                    </span>
                    <Stars rating={c.rating} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {selectedRows.length > 0 && (
          <>
            <Card tone="raised">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-base">Target symptoms</CardTitle>
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
                  {overlaps.map(({ symptom, count }) => (
                    <Badge key={symptom} tone={count >= 2 ? "success" : "accent"}>
                      {symptom}
                      {count >= 2 && (
                        <span className="ml-1 text-[10px] font-semibold opacity-80">
                          {count}x
                        </span>
                      )}
                    </Badge>
                  ))}
                </div>
                {selectedRows.length >= 2 && overlaps.some((s) => s.count >= 2) && (
                  <p className="text-[11px] text-text-subtle mt-3 flex items-start gap-1.5">
                    <Sparkles className="w-3 h-3 mt-0.5 text-accent shrink-0" aria-hidden />
                    Symptoms marked 2x+ are reinforced by multiple supplements in your stack.
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

            {selectedRows.some((c) => c.cannabisInteraction) && (
              <Card tone="raised" className="border-accent/30">
                <CardHeader className="pb-1">
                  <CardTitle className="text-sm text-accent">
                    Cannabis interactions
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1.5">
                    {selectedRows
                      .filter((c) => c.cannabisInteraction)
                      .map((c) => (
                        <li key={c.id} className="text-xs text-text-muted leading-relaxed">
                          <span className="font-medium text-text">{c.name}:</span>{" "}
                          {c.cannabisInteraction}
                        </li>
                      ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {selectedRows.some((c) => c.articles.length > 0) && (
              <Card tone="raised">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-accent" aria-hidden />
                    Research &amp; evidence
                  </CardTitle>
                  <CardDescription>
                    Peer-reviewed reading for the supplements in your stack.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {selectedRows
                    .filter((c) => c.articles.length > 0)
                    .map((c) => (
                      <div key={c.id}>
                        <p className="text-xs font-medium text-text mb-1.5 flex items-center gap-2">
                          {c.name}
                          <Stars rating={c.rating} />
                        </p>
                        <ul className="space-y-1">
                          {c.articles.map((article) => (
                            <li key={article.url}>
                              <button
                                type="button"
                                onClick={() => setPendingArticle(article)}
                                className="group inline-flex items-start gap-1.5 text-left text-xs text-accent hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded"
                              >
                                <ExternalLink
                                  className="h-3 w-3 mt-0.5 shrink-0"
                                  aria-hidden
                                />
                                <span>
                                  {article.title}
                                  <span className="text-text-subtle">
                                    {" "}
                                    · {article.source}
                                  </span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                </CardContent>
              </Card>
            )}

            {context !== "clinical" && (
              <Link
                href={`/leafmart/shop?supplements=${selectedRows
                  .map((c) => c.id)
                  .join(",")}`}
                prefetch={false}
                className="group flex items-center justify-between gap-3 rounded-2xl bg-accent px-5 py-3.5 text-white shadow-[0_8px_24px_-10px_rgba(58,133,96,0.55)] transition-all hover:-translate-y-0.5 hover:shadow-[0_12px_28px_-10px_rgba(58,133,96,0.65)]"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 ring-1 ring-white/30">
                    <ShoppingCart className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  </span>
                  <span className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold leading-tight">
                      Shop this stack on Leafmart
                    </span>
                    <span className="text-[11px] text-white/80 leading-tight truncate">
                      {selectedRows.map((c) => c.name).join(" + ")}
                    </span>
                  </span>
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            )}
          </>
        )}
      </div>

      {/* EMR-151 — provider-consult disclaimer before leaving for an
          external research source. */}
      <Dialog
        open={pendingArticle !== null}
        onOpenChange={(next) => {
          if (!next) setPendingArticle(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-[color:var(--warning)]" aria-hidden />
              Before you start
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-muted leading-relaxed">
            Please discuss any new supplement with your provider before
            starting — especially if you take prescription medications, are
            pregnant, or are managing a chronic condition. You&rsquo;re about
            to open external research that we don&rsquo;t control.
          </p>
          {pendingArticle && (
            <p className="mt-3 text-xs text-text-subtle">
              Opening: <span className="text-text">{pendingArticle.title}</span>{" "}
              · {pendingArticle.source}
            </p>
          )}
          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setPendingArticle(null)}
              className="px-4 py-2 rounded-md border border-border bg-surface text-sm font-medium text-text hover:bg-surface-muted transition-colors"
            >
              Stay here
            </button>
            <button
              type="button"
              onClick={confirmOpenArticle}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-accent text-accent-ink text-sm font-medium hover:bg-accent/90 transition-colors"
            >
              Continue to research
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
