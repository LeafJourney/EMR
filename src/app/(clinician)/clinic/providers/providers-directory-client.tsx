"use client";

import { useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import {
  providerMatchesQuery,
  type SearchableProvider,
} from "@/lib/search/provider-search";

// EMR-613 — client wrapper for the provider directory. Owns the search
// box; filters the server-supplied list in-memory (the page hard-caps at
// `PROVIDER_DIRECTORY_CAP` so the filter stays sub-millisecond).
//
// EMR-667 — adds '/' slash-command support so clinicians can narrow by
// specialty or hospital affiliation with a quick keyboard shortcut:
//   /specialty <term>  — filter by specialty only
//   /hospital <term>   — filter by hospital affiliation only
//   /ancillary         — scroll to the Ancillary Services section

export interface ProviderRow extends SearchableProvider {
  id: string;
  userId: string;
  bio: string | null;
}

interface Props {
  providers: ProviderRow[];
}

// ── Slash-command helpers ──────────────────────────────────────────────────

type SlashMode = "specialty" | "hospital" | null;

function parseSlashCommand(raw: string): { mode: SlashMode; term: string } {
  if (!raw.startsWith("/")) return { mode: null, term: raw };
  const body = raw.slice(1);
  if (body.startsWith("specialty ")) return { mode: "specialty", term: body.slice(10) };
  if (body.startsWith("hospital ")) return { mode: "hospital", term: body.slice(9) };
  return { mode: null, term: body };
}

function applyFilter(providers: ProviderRow[], search: string): ProviderRow[] {
  const { mode, term } = parseSlashCommand(search);
  if (!search.trim()) return providers;
  if (mode === "specialty") {
    const t = term.toLowerCase();
    if (!t) return providers;
    return providers.filter((p) => p.specialties.some((s) => s.toLowerCase().includes(t)));
  }
  if (mode === "hospital") {
    const t = term.toLowerCase();
    if (!t) return providers;
    return providers.filter((p) =>
      p.hospitalAffiliations.some((h) => h.toLowerCase().includes(t))
    );
  }
  if (search.startsWith("/")) return providers; // unrecognised command — show all
  return providers.filter((p) => providerMatchesQuery(p, search));
}

function getSuggestions(raw: string, providers: ProviderRow[]): string[] {
  if (!raw.startsWith("/")) return [];
  const body = raw.slice(1);

  if (!body || (!body.startsWith("specialty") && !body.startsWith("hospital"))) {
    const top = ["/specialty", "/hospital", "/ancillary"];
    return body ? top.filter((s) => s.slice(1).startsWith(body)) : top;
  }
  if (body.startsWith("specialty ")) {
    const term = body.slice(10).toLowerCase();
    const all = [...new Set(providers.flatMap((p) => p.specialties))].sort();
    return all
      .filter((s) => !term || s.toLowerCase().includes(term))
      .slice(0, 8)
      .map((s) => `/specialty ${s}`);
  }
  if (body.startsWith("hospital ")) {
    const term = body.slice(9).toLowerCase();
    const all = [...new Set(providers.flatMap((p) => p.hospitalAffiliations))].sort();
    return all
      .filter((h) => !term || h.toLowerCase().includes(term))
      .slice(0, 8)
      .map((h) => `/hospital ${h}`);
  }
  return [];
}

// ── Shared icon ────────────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      className="text-text-subtle"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function ProvidersDirectoryClient({ providers }: Props) {
  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(() => getSuggestions(search, providers), [search, providers]);
  const filtered = useMemo(() => applyFilter(providers, search), [providers, search]);
  const { mode } = parseSlashCommand(search);

  function applySuggestion(s: string) {
    if (s === "/ancillary") {
      document.getElementById("ancillary")?.scrollIntoView({ behavior: "smooth" });
      setSearch("");
      setShowDropdown(false);
      return;
    }
    setSearch(s + " ");
    setShowDropdown(false);
    setActiveIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!showDropdown || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      applySuggestion(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIdx(-1);
    }
  }

  return (
    <div className="space-y-5">
      {/* Search box with slash-command support */}
      <div className="relative max-w-md">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <SearchIcon />
        </div>
        <Input
          ref={inputRef}
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setShowDropdown(e.target.value.startsWith("/"));
            setActiveIdx(-1);
          }}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          onFocus={() => search.startsWith("/") && setShowDropdown(true)}
          placeholder="Search providers or type / for commands…"
          className="pl-9"
          aria-label="Search providers"
          aria-autocomplete="list"
          aria-expanded={showDropdown && suggestions.length > 0}
        />

        {/* Slash-command dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute top-full mt-1 left-0 right-0 z-50 bg-surface border border-border rounded-lg shadow-lg overflow-hidden">
            {suggestions.map((s, i) => {
              const [cmd, ...rest] = s.split(" ");
              return (
                <button
                  key={s}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(s);
                  }}
                  className={`w-full text-left px-4 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                    i === activeIdx ? "bg-accent/10" : "hover:bg-surface-muted"
                  }`}
                >
                  <span className="font-mono text-accent font-medium text-xs">{cmd}</span>
                  {rest.length > 0 && (
                    <span className="text-text-muted truncate">{rest.join(" ")}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Active filter indicator */}
      {mode && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-muted">Filtering by</span>
          <Badge tone="accent" className="font-mono text-xs">/{mode}</Badge>
          <button
            onClick={() => setSearch("")}
            className="text-xs text-text-subtle hover:text-text transition-colors"
            aria-label="Clear filter"
          >
            ✕ clear
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          title="No providers match your search"
          description={
            mode
              ? `No providers found with that ${mode}. Try a broader term or clear the filter.`
              : "Try a different name, specialty, address, or hospital affiliation."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((provider) => (
            <Card key={provider.id} className="card-hover">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <Avatar
                    firstName={provider.firstName}
                    lastName={provider.lastName}
                    size="lg"
                    className="shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-display text-lg font-medium text-text tracking-tight truncate">
                      {provider.firstName} {provider.lastName}
                    </h3>
                    {provider.title && (
                      <p className="text-sm text-text-muted mt-0.5 truncate">
                        {provider.title}
                      </p>
                    )}
                  </div>
                </div>

                {provider.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-4">
                    {provider.specialties.map((specialty) => (
                      <Badge key={specialty} tone="accent">
                        {specialty}
                      </Badge>
                    ))}
                  </div>
                )}

                {provider.hospitalAffiliations.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {provider.hospitalAffiliations.map((h) => (
                      <Badge key={h} tone="neutral">
                        {h}
                      </Badge>
                    ))}
                  </div>
                )}

                {provider.practiceAddress && (
                  <p className="text-xs text-text-subtle mt-3 leading-relaxed whitespace-pre-line">
                    {provider.practiceAddress}
                  </p>
                )}

                {provider.bio && (
                  <p className="text-xs text-text-subtle mt-3 line-clamp-2 leading-relaxed">
                    {provider.bio}
                  </p>
                )}

                <div className="mt-4 pt-3 border-t border-border/60">
                  <a
                    href={`/clinic/providers/messages?userId=${provider.userId}`}
                    className="flex items-center justify-center gap-2 w-full text-sm font-medium text-accent py-2 rounded-md border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-accent">
                      <path
                        d="M12 1H2C1.45 1 1 1.45 1 2V9.5C1 10.05 1.45 10.5 2 10.5H4L7 13L10 10.5H12C12.55 10.5 13 10.05 13 9.5V2C13 1.45 12.55 1 12 1Z"
                        stroke="currentColor"
                        strokeWidth="1.2"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Secure message
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
