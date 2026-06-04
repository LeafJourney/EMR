"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, ShieldAlert } from "lucide-react";
import {
  checkInteractions,
  getSeverityLabel,
  type DrugInteraction,
} from "@/lib/domain/drug-interactions";

/**
 * Parse a free-text list of meds/supplements separated by commas, newlines,
 * or semicolons. Trims whitespace and drops empty entries.
 *
 * EMR-617 — patients enter meds & supplements in a single textarea and the
 * acceptance criteria explicitly call out both comma- and newline-separated
 * input. Centralized here so the standalone page and the embedded tab both
 * parse identically.
 */
export function parseMedicationInput(input: string): string[] {
  return input
    .split(/[,\n;]+/)
    .map((m) => m.trim())
    .filter(Boolean);
}

// CBN omitted — the bundled database has no CBN entries yet.
const DEFAULT_CANNABINOIDS = ["THC", "CBD"];

export interface DrugMixCheckerProps {
  /**
   * Heading shown above the form. The standalone /education/drug-mix page
   * supplies its own page header so it passes `heading={null}` to suppress
   * the embedded title. The tab variant gets the default heading.
   */
  heading?: React.ReactNode;
  /** Description shown under the heading. */
  description?: React.ReactNode;
  /** Optional className applied to the outer wrapper. */
  className?: string;
}

/**
 * Patient-facing drug interaction checker (EMR-617).
 *
 * Renders a textarea + "Check Interactions" button and a list of
 * green/yellow/red interaction cards backed by the same data source as
 * /clinic/library. No PHI is captured — input lives only in component state.
 */
export function DrugMixChecker({
  heading,
  description,
  className,
}: DrugMixCheckerProps) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<DrugInteraction[] | null>(null);
  const [loading, setLoading] = useState(false);

  const parsed = parseMedicationInput(input);
  const itemCount = parsed.length;

  function checkMix() {
    setLoading(true);
    // Small delay preserves the "analyzing" affordance the existing tab UI
    // exposed; users perceive the work as substantive even though the lookup
    // is synchronous against the bundled JSON.
    setTimeout(() => {
      setResults(checkInteractions(parsed, DEFAULT_CANNABINOIDS));
      setLoading(false);
    }, 600);
  }

  const showDefaultHeading = heading === undefined;

  return (
    <div className={cn("max-w-3xl mx-auto space-y-8 sm:space-y-10 px-4 sm:px-0", className)}>
      {showDefaultHeading ? (
        <div className="text-center mb-6 sm:mb-8">
          <h2 className="font-display text-3xl sm:text-4xl text-text tracking-tight mb-3">
            Drug Interaction Checker
          </h2>
          <p className="text-sm sm:text-base text-text-muted max-w-xl mx-auto leading-relaxed">
            {description ??
              "Add all of your medications and supplements to see if they interact with cannabis."}
          </p>
        </div>
      ) : (
        heading
      )}

      <Card tone="raised" className="rounded-3xl shadow-xl overflow-hidden border border-border bg-white">
        <CardContent className="p-5 sm:p-8">
          <div className="flex items-center justify-between mb-3">
            <label
              htmlFor="drugmix-meds"
              className="block text-base font-semibold text-text"
            >
              Your medications &amp; supplements
            </label>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
          </div>
          <p className="text-sm text-text-muted mb-3 leading-relaxed">
            Add all of your medications and supplements to see if they interact with cannabis.
          </p>
          <textarea
            id="drugmix-meds"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              "Separate with commas or new lines, e.g.:\nWarfarin, Metformin, Lisinopril\nSt. John's Wort\nVitamin D"
            }
            rows={6}
            aria-describedby="drugmix-help"
            className="w-full rounded-2xl border-2 border-slate-200 bg-slate-50 px-5 py-4 text-base text-text placeholder:text-slate-400 focus:outline-none focus:border-accent focus:bg-white focus:ring-4 focus:ring-accent/20 transition-all resize-none shadow-inner"
          />
          <p id="drugmix-help" className="text-xs text-slate-500 mt-2">
            No login required. Your list stays on your device — nothing is saved.
          </p>
          <Button
            onClick={checkMix}
            disabled={itemCount === 0 || loading}
            className="mt-6 rounded-xl w-full h-14 text-base sm:text-lg font-semibold shadow-md"
          >
            {loading ? "Analyzing Database..." : "Check Interactions"}
          </Button>
        </CardContent>
      </Card>

      {results !== null && (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-2xl">Results</h3>
            {results.length > 0 && (
              <Badge tone="neutral" className="text-[10px] uppercase tracking-widest font-bold">
                {results.length} {results.length === 1 ? "interaction" : "interactions"}
              </Badge>
            )}
          </div>

          {results.length === 0 ? (
            <Card className="rounded-2xl border-2 border-emerald-400 bg-emerald-50/50 shadow-sm">
              <CardContent className="p-6 flex items-start gap-4">
                <div className="bg-emerald-100 p-3 rounded-full text-emerald-600 shrink-0">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-emerald-900 mb-1">
                    No known interactions found
                  </h4>
                  <p className="text-emerald-700 font-medium">
                    Based on our database, the items you listed do not have known severe interactions with cannabis. Always consult your provider.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            results.map((ix, i) => {
              const isRed = ix.severity === "red";
              const isYellow = ix.severity === "yellow";

              return (
                <Card
                  key={`${ix.drug}-${ix.cannabinoid}-${i}`}
                  className={cn(
                    "rounded-2xl border-2 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5",
                    isRed
                      ? "border-red-400 bg-red-50/30"
                      : isYellow
                        ? "border-amber-400 bg-amber-50/30"
                        : "border-emerald-400 bg-emerald-50/30"
                  )}
                >
                  <CardContent className="p-5 sm:p-6">
                    <div className="flex items-start gap-3 sm:gap-4">
                      <div
                        className={cn(
                          "p-3 rounded-full shrink-0",
                          isRed
                            ? "bg-red-100 text-red-600"
                            : isYellow
                              ? "bg-amber-100 text-amber-600"
                              : "bg-emerald-100 text-emerald-600"
                        )}
                      >
                        {isRed ? (
                          <ShieldAlert className="w-6 h-6" />
                        ) : isYellow ? (
                          <AlertTriangle className="w-6 h-6" />
                        ) : (
                          <CheckCircle className="w-6 h-6" />
                        )}
                      </div>

                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-2">
                          <h4 className="text-lg font-bold text-slate-800">
                            {ix.drug}
                            <span className="text-slate-400 font-normal mx-1">+</span>
                            {ix.cannabinoid}
                          </h4>
                          <Badge
                            tone={isRed ? "danger" : isYellow ? "warning" : "success"}
                            className="uppercase tracking-widest text-[10px] font-bold"
                          >
                            {getSeverityLabel(ix.severity)}
                          </Badge>
                        </div>

                        <div className="bg-white/60 p-4 rounded-xl border border-black/5 mb-3">
                          <p className="text-sm text-slate-700 font-medium leading-relaxed">
                            <strong className="text-slate-900 block mb-1">Mechanism:</strong>
                            {ix.mechanism}
                          </p>
                        </div>

                        <p
                          className={cn(
                            "text-sm font-bold flex items-center gap-2",
                            isRed
                              ? "text-red-700"
                              : isYellow
                                ? "text-amber-700"
                                : "text-emerald-700"
                          )}
                        >
                          <span>Action:</span> {ix.recommendation}
                        </p>

                        {ix.references.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {ix.references.map((ref) => {
                              const pmidMatch = ref.match(/PMID:\s*(\d+)/i);
                              const href = pmidMatch
                                ? `https://pubmed.ncbi.nlm.nih.gov/${pmidMatch[1]}/`
                                : null;
                              return href ? (
                                <a
                                  key={ref}
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-accent bg-slate-100 hover:bg-accent/10 px-2.5 py-1 rounded-full transition-colors"
                                >
                                  {ref}
                                  <span aria-hidden="true">↗</span>
                                </a>
                              ) : (
                                <span
                                  key={ref}
                                  className="inline-flex items-center text-[10px] font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full"
                                >
                                  {ref}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
