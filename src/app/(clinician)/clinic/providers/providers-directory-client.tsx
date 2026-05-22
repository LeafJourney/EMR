"use client";

import { useMemo, useState } from "react";
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
// `PROVIDER_DIRECTORY_CAP` so the filter stays sub-millisecond well past
// the ticket's 5,000-contact performance target).

export interface ProviderRow extends SearchableProvider {
  id: string;
  bio: string | null;
}

interface Props {
  providers: ProviderRow[];
}

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
      <path
        d="M10.5 10.5L14 14"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ProvidersDirectoryClient({ providers }: Props) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return providers;
    return providers.filter((p) => providerMatchesQuery(p, search));
  }, [providers, search]);

  return (
    <div className="space-y-5">
      <div className="relative max-w-md">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <SearchIcon />
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, specialty, address, or hospital..."
          className="pl-9"
          aria-label="Search providers"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No providers match your search"
          description="Try a different name, specialty, address, or hospital affiliation."
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
                    href="/clinic/providers/messages"
                    className="flex items-center justify-center gap-2 w-full text-sm font-medium text-accent py-2 rounded-md border border-accent/30 bg-accent/5 hover:bg-accent/10 transition-colors"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 14 14"
                      fill="none"
                      className="text-accent"
                    >
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

      {/* Ancillary Services Section */}
      {!search && (
        <div className="mt-12 pt-8 border-t border-border">
          <h2 className="text-xl font-display font-medium text-text mb-6">Ancillary Services</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { name: "Verdant Pharmacy", desc: "In-house compounding and dispensary", phone: "555-0101" },
              { name: "Apex Imaging", desc: "MRI, CT, X-Ray", phone: "555-0102" },
              { name: "Central Lab", desc: "Bloodwork, Pathology, Genetics", phone: "555-0103" }
            ].map((service) => (
              <Card key={service.name} className="card-hover">
                <CardContent className="pt-6">
                  <h3 className="font-display text-base font-medium text-text">{service.name}</h3>
                  <p className="text-xs text-text-muted mt-1">{service.desc}</p>
                  <p className="text-sm font-medium text-accent mt-3">{service.phone}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
