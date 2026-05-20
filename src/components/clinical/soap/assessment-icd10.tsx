// SAFE: dead-export-allowed reason="Wave 9 SOAP fragment scaffold (EMR-070); composed into the note workspace in a later wave"
"use client";

import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

interface Icd10Code {
  code: string;
  description: string;
  category: "cannabis" | "pain" | "mental" | "sleep" | "other";
}

// Curated starter set focused on common cannabis-clinic diagnoses.
// In production this is backed by a server-side search; the picker
// component just needs a stable input/output contract.
const ICD10_LIBRARY: Icd10Code[] = [
  { code: "F12.10", description: "Cannabis abuse, uncomplicated", category: "cannabis" },
  { code: "F12.20", description: "Cannabis dependence, uncomplicated", category: "cannabis" },
  { code: "F12.90", description: "Cannabis use, unspecified, uncomplicated", category: "cannabis" },
  { code: "Z71.89", description: "Other specified counseling", category: "cannabis" },
  { code: "Z79.891", description: "Long-term (current) use of opiate analgesic", category: "cannabis" },
  { code: "G89.29", description: "Other chronic pain", category: "pain" },
  { code: "M54.50", description: "Low back pain, unspecified", category: "pain" },
  { code: "M79.10", description: "Myalgia, unspecified site", category: "pain" },
  { code: "G43.909", description: "Migraine, unspecified", category: "pain" },
  { code: "F41.1", description: "Generalized anxiety disorder", category: "mental" },
  { code: "F33.1", description: "Major depressive disorder, recurrent, moderate", category: "mental" },
  { code: "F43.10", description: "Post-traumatic stress disorder, unspecified", category: "mental" },
  { code: "G47.00", description: "Insomnia, unspecified", category: "sleep" },
  { code: "G47.33", description: "Obstructive sleep apnea", category: "sleep" },
];

export interface AssessmentIcd10Props {
  initialSelected?: string[];
  onChange?: (selected: Icd10Code[]) => void;
}

export function AssessmentIcd10({ initialSelected = [], onChange }: AssessmentIcd10Props) {
  const [query, setQuery] = useState("");
  const [selectedCodes, setSelectedCodes] = useState<string[]>(initialSelected);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ICD10_LIBRARY.slice(0, 8);
    return ICD10_LIBRARY.filter(
      (c) => c.code.toLowerCase().includes(q) || c.description.toLowerCase().includes(q),
    ).slice(0, 12);
  }, [query]);

  const selected = useMemo(
    () => selectedCodes.map((c) => ICD10_LIBRARY.find((l) => l.code === c)).filter((c): c is Icd10Code => !!c),
    [selectedCodes],
  );

  const toggle = (code: string) => {
    setSelectedCodes((prev) => {
      const next = prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code];
      onChange?.(next.map((c) => ICD10_LIBRARY.find((l) => l.code === c)!).filter(Boolean));
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Assessment — ICD-10</CardTitle>
        <CardDescription>Search and select diagnoses. Cannabis-related codes appear at the top of the library.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="icd10-search">Search by code or description</Label>
            <Input
              id="icd10-search"
              type="search"
              placeholder="e.g., F12, anxiety, sleep"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
          </div>

          {selected.length > 0 && (
            <div className="space-y-2">
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                Selected ({selected.length})
              </div>
              <div className="flex flex-wrap gap-2">
                {selected.map((c) => (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => toggle(c.code)}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] text-white text-xs font-medium px-2.5 py-1.5 hover:bg-[var(--accent)]/90"
                    aria-label={`Remove ${c.code}`}
                  >
                    <span className="font-bold">{c.code}</span>
                    <span className="opacity-90 truncate max-w-[20ch]">{c.description}</span>
                    <span aria-hidden="true">×</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-2">
              {query.trim() ? `Results (${results.length})` : "Common diagnoses"}
            </div>
            <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-xl overflow-hidden">
              {results.length === 0 && (
                <li className="px-4 py-6 text-sm text-text-muted text-center">No matches.</li>
              )}
              {results.map((c) => {
                const isSelected = selectedCodes.includes(c.code);
                return (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => toggle(c.code)}
                      className={`w-full flex items-center justify-between gap-3 px-4 py-3 text-left text-sm transition-colors ${
                        isSelected ? "bg-[var(--accent)]/10" : "hover:bg-[var(--surface-muted)]/40"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-bold text-text">{c.code}</div>
                        <div className="text-text-muted truncate">{c.description}</div>
                      </div>
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-md ${
                          isSelected
                            ? "bg-[var(--accent)] text-white"
                            : "bg-[var(--surface-muted)] text-text-muted"
                        }`}
                      >
                        {isSelected ? "Selected" : "Add"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </CardContent>
        <CardFooter className="pt-6 border-t border-[var(--border)] flex justify-end">
          <Button type="submit" variant="primary" disabled={selected.length === 0}>
            Save Assessment
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default AssessmentIcd10;
