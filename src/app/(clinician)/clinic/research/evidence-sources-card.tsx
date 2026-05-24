/**
 * EMR-668 — "Search the Evidence" multi-source aggregation card.
 *
 * Shown for all practices regardless of modality (these are general clinical
 * references, not cannabis-specific). The internal research-database query
 * already runs through the synthesizer agent; this card fans the same query
 * out to authoritative external sources by deep-linking to each one's own
 * search UI in a new tab.
 *
 * The card mirrors the seed text from the most recent saved query so a
 * clinician's last search is one click away on every external source. If
 * there's no saved query yet, the source tiles open the source homepage
 * directly (the source's own search UI takes over from there).
 */
"use client";

import { useState } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EVIDENCE_SOURCES } from "./evidence-sources";

export function EvidenceSourcesCard({ seedQuery }: { seedQuery: string }) {
  const [q, setQ] = useState(seedQuery);
  const trimmed = q.trim();

  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle>Search the evidence</CardTitle>
        <CardDescription>
          Multi-source aggregation — type a query and open it on any of these
          authoritative references in a new tab.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder='e.g. "insomnia in OSA" or "amitriptyline neuropathic pain"'
          aria-label="Search query for external evidence sources"
          className="mb-4"
        />
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {EVIDENCE_SOURCES.map((s) => {
            const href = trimmed ? s.searchUrl(trimmed) : s.searchUrl("");
            return (
              <li key={s.id}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block rounded-lg border border-border/60 px-4 py-3 hover:bg-surface-muted/40 hover:border-accent/40 transition-colors"
                >
                  <p className="text-sm font-medium text-text">
                    {s.label} <span aria-hidden="true">↗</span>
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">{s.blurb}</p>
                </a>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-text-subtle mt-3">
          External sites open in a new tab. Some sources (Lexicomp, ESMED)
          require their own login.
        </p>
      </CardContent>
    </Card>
  );
}
