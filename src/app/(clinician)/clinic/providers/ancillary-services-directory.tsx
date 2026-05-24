"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

// EMR-667 — Ancillary Services directory.
// Static card grid for external referral destinations: labs, imaging centres,
// pharmacies, and cannabis dispensaries. No DB model today; the data lives here
// until an `AncillaryFacility` table ships (schema-free by design for now).

type ServiceCategory = "lab" | "imaging" | "pharmacy" | "dispensary" | "rehab";

interface AncillaryService {
  id: string;
  name: string;
  category: ServiceCategory;
  address: string;
  phone?: string;
  notes?: string;
}

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  lab: "Lab",
  imaging: "Imaging",
  pharmacy: "Pharmacy",
  dispensary: "Dispensary",
  rehab: "Rehab / PT",
};

const CATEGORY_TONES: Record<
  ServiceCategory,
  "accent" | "info" | "warning" | "success" | "neutral"
> = {
  lab: "info",
  imaging: "accent",
  pharmacy: "success",
  dispensary: "warning",
  rehab: "neutral",
};

const SERVICES: AncillaryService[] = [
  {
    id: "anc-lab-1",
    name: "Quest Diagnostics",
    category: "lab",
    address: "1200 Medical Center Dr, Ste 2A",
    phone: "800-697-8378",
    notes: "STAT turnaround available; preferred for CBC, CMP, lipid panels.",
  },
  {
    id: "anc-lab-2",
    name: "LabCorp",
    category: "lab",
    address: "850 Health Pkwy",
    phone: "800-845-6167",
    notes: "Preferred for urine drug screens and genetic testing panels.",
  },
  {
    id: "anc-img-1",
    name: "Advanced Radiology Group",
    category: "imaging",
    address: "340 Imaging Blvd, Ste 100",
    phone: "555-0110",
    notes: "MRI, CT, X-ray, ultrasound. Same-day slots Tue / Thu.",
  },
  {
    id: "anc-img-2",
    name: "OpenMRI & Imaging",
    category: "imaging",
    address: "77 Oak St",
    phone: "555-0117",
    notes: "Open-bore MRI — ideal for claustrophobic or bariatric patients.",
  },
  {
    id: "anc-rx-1",
    name: "Walgreens Specialty Pharmacy",
    category: "pharmacy",
    address: "1500 Main St",
    phone: "800-501-2200",
    notes: "Handles specialty and compounded scripts. Accepts most PBMs.",
  },
  {
    id: "anc-rx-2",
    name: "Village Compounding Pharmacy",
    category: "pharmacy",
    address: "23 Elm Ct",
    phone: "555-0143",
    notes: "Custom dosage forms, flavouring for paeds, topical compound Rx.",
  },
  {
    id: "anc-disp-1",
    name: "Leafly Dispensary — Downtown",
    category: "dispensary",
    address: "88 Green Ave",
    phone: "555-0199",
    notes: "Medical-only dispensary; staff trained on cannabinoid ratios.",
  },
  {
    id: "anc-disp-2",
    name: "Harvest House of Cannabis",
    category: "dispensary",
    address: "200 Harvest Rd",
    phone: "555-0155",
    notes: "Wide terpene selection; accepts LeafJourney patient QR codes.",
  },
  {
    id: "anc-rehab-1",
    name: "ProActive Physical Therapy",
    category: "rehab",
    address: "612 Wellness Blvd",
    phone: "555-0188",
    notes: "Cannabis-integrated PT. Manual + movement therapy. In-network.",
  },
];

function matchesQuery(svc: AncillaryService, q: string): boolean {
  const lq = q.toLowerCase();
  return (
    svc.name.toLowerCase().includes(lq) ||
    svc.category.includes(lq) ||
    CATEGORY_LABELS[svc.category].toLowerCase().includes(lq) ||
    svc.address.toLowerCase().includes(lq) ||
    (svc.notes?.toLowerCase().includes(lq) ?? false)
  );
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
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

export function AncillaryServicesDirectory() {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return SERVICES;
    return SERVICES.filter((s) => matchesQuery(s, search));
  }, [search]);

  return (
    <section id="ancillary" className="space-y-5">
      <div>
        <h2 className="font-display text-xl font-semibold text-text tracking-tight">
          Ancillary Services
        </h2>
        <p className="text-sm text-text-muted mt-0.5">
          Labs, imaging, pharmacy, and dispensary referral contacts.
        </p>
      </div>

      <div className="relative max-w-md">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
          <SearchIcon />
        </div>
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search labs, imaging, pharmacy…"
          className="pl-9"
          aria-label="Search ancillary services"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No services match"
          description="Try a different name, category, or address."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((svc) => (
            <Card key={svc.id} className="card-hover">
              <CardContent className="pt-5 pb-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-display text-base font-medium text-text leading-snug">
                    {svc.name}
                  </h3>
                  <Badge tone={CATEGORY_TONES[svc.category]} className="shrink-0">
                    {CATEGORY_LABELS[svc.category]}
                  </Badge>
                </div>

                <p className="text-xs text-text-subtle leading-relaxed">
                  {svc.address}
                </p>

                {svc.notes && (
                  <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                    {svc.notes}
                  </p>
                )}

                {svc.phone && (
                  <div className="pt-2 border-t border-border/60">
                    <a
                      href={`tel:${svc.phone}`}
                      className="flex items-center gap-2 text-sm font-medium text-accent hover:underline"
                    >
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
                        <path
                          d="M2 1h2.5l1 3-1.5 1a7.5 7.5 0 003 3l1-1.5 3 1V10a1 1 0 01-1 1A9 9 0 011 2a1 1 0 011-1z"
                          stroke="currentColor"
                          strokeWidth="1.1"
                          strokeLinejoin="round"
                        />
                      </svg>
                      {svc.phone}
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}
