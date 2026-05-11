"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Eyebrow, EditorialRule, LeafSprig } from "@/components/ui/ornament";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import {
  AFFILIATE_PARTNERS,
  decorateAffiliateUrl,
  type AffiliatePartnerInfo,
} from "@/lib/affiliate/partners";

// EMR-039 — store cards now mirror the AffiliatePartner registry so
// the partner list, disclaimer copy, and joint-decision note can be
// updated in one place. Local product entries (Gold Skin Serum, etc.)
// stay inline because they aren't part of the partner program.

interface StoreCard {
  name: string;
  brand: string;
  category: string;
  description: string;
  price: string;
  url: string;
  badge: string | null;
  partnerSlug?: string;
  disclaimerText?: string;
  jointDecisionNote?: string;
}

const ACTIVE_PARTNERS = AFFILIATE_PARTNERS.filter((p) => p.status === "active").sort(
  (a, b) => a.sortOrder - b.sortOrder,
);

const PARTNER_CARDS: StoreCard[] = ACTIVE_PARTNERS.map((p: AffiliatePartnerInfo) => ({
  name:
    p.slug === "phytorx"
      ? "Pain and Recovery Formula"
      : p.slug === "flower-powered-products"
        ? "CBD Wellness Products"
        : p.slug === "aulv"
          ? "Plant-Based Wellness Collective"
          : p.name,
  brand: p.name,
  category: p.category,
  description: p.description,
  price:
    p.slug === "phytorx"
      ? "$89.99"
      : p.slug === "flower-powered-products"
        ? "From $34.99"
        : "Visit site for pricing",
  url: decorateAffiliateUrl(p),
  badge: p.slug === "phytorx" ? "Best seller" : p.slug === "aulv" ? "New" : null,
  partnerSlug: p.slug,
  disclaimerText: p.disclaimerText,
  jointDecisionNote: p.jointDecisionNote,
}));

const LOCAL_CARDS: StoreCard[] = [
  {
    name: "Gold Skin Serum",
    brand: "CBD",
    category: "Skincare",
    description:
      "Luxurious CBD-infused skin serum with 24K gold flakes. Designed for anti-aging, hydration, and radiance. Lab-tested, clean ingredients.",
    price: "$89.99",
    url: "https://www.potency710.com/product/gold-skin-serum/",
    badge: null,
  },
];

const PRODUCTS: StoreCard[] = [...PARTNER_CARDS, ...LOCAL_CARDS];

const CATEGORIES = Array.from(
  new Set<string>(["All", ...PRODUCTS.map((p) => p.category)]),
);

export default function StorePage() {
  const [category, setCategory] = useState("All");
  const [disclaimerCard, setDisclaimerCard] = useState<StoreCard | null>(null);
  const disclaimerUrl = disclaimerCard?.url ?? null;

  const filtered =
    category === "All"
      ? PRODUCTS
      : PRODUCTS.filter((p) => p.category === category);

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 85% 10%, var(--highlight-soft), transparent 65%)," +
            "radial-gradient(ellipse 50% 60% at 10% 90%, var(--accent-soft), transparent 60%)",
        }}
      />

      <SiteHeader />
      <main id="main-content">

      {/* Hero */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-12 pb-10 text-center">
        <Eyebrow className="mb-6 justify-center">Curated wellness</Eyebrow>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-text max-w-3xl mx-auto">
          The <span className="text-accent">Leafjourney</span> Store
        </h1>
        <p className="text-[17px] md:text-lg text-text-muted mt-6 max-w-xl mx-auto leading-relaxed">
          Physician-curated cannabis wellness products from trusted partners.
          Every product is third-party tested and clinician-recommended.
        </p>
      </section>

      {/* Category filter */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pb-10">
        <div className="flex flex-wrap items-center justify-center gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                category === cat
                  ? "bg-accent text-accent-ink shadow-sm"
                  : "bg-surface-raised text-text-muted border border-border hover:border-border-strong hover:text-text"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </section>

      {/* Products grid */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((product) => (
            <article
              key={product.name}
              className="relative bg-surface-raised rounded-2xl border border-border p-7 shadow-sm card-hover flex flex-col"
            >
              {product.badge && (
                <span className="absolute top-4 right-4 text-[10px] font-semibold uppercase tracking-wider bg-accent/10 text-accent px-2.5 py-1 rounded-full">
                  {product.badge}
                </span>
              )}

              {/* Product icon placeholder */}
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent/10 to-highlight/10 flex items-center justify-center mb-5">
                <LeafSprig size={28} className="text-accent" />
              </div>

              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle">
                {product.brand} &middot; {product.category}
              </span>
              <h3 className="font-display text-xl text-text tracking-tight mt-2">
                {product.name}
              </h3>
              <p className="text-sm text-text-muted mt-2 leading-relaxed flex-1">
                {product.description}
              </p>

              <div className="mt-5 flex items-center justify-between">
                <span className="font-display text-2xl text-text tracking-tight">
                  {product.price}
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDisclaimerCard(product)}
                >
                  View product
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* Partner section */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised p-10 md:p-14 ambient">
          <div className="relative max-w-2xl mx-auto text-center">
            <Eyebrow className="mb-4 justify-center">Partner brands</Eyebrow>
            <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
              Trusted by leading cannabis wellness brands
            </h2>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-8 text-text-muted">
              <span className="font-display text-xl tracking-tight">Greenleaf Co.</span>
              <span className="text-border-strong">|</span>
              <span className="text-sm text-text-subtle italic">More partners coming soon</span>
            </div>
          </div>
        </div>
      </section>

      {/* Disclaimer modal — copy is partner-specific when the card carries
          a registered AffiliatePartner; falls back to default disclaimer
          for local cards (e.g. Gold Skin Serum). */}
      {disclaimerCard && disclaimerUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-surface-raised rounded-2xl border border-border shadow-xl p-8 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-highlight/10 flex items-center justify-center">
                <LeafSprig size={20} className="text-highlight" />
              </div>
              <h3 className="font-display text-xl text-text tracking-tight">
                Before you go
              </h3>
            </div>
            <p className="text-sm text-text-muted leading-relaxed mb-4">
              {disclaimerCard.disclaimerText ??
                "You are leaving Leafjourney to visit a partner website. Please consult your healthcare provider before considering these products. Cannabis products are not FDA-approved medications and individual results may vary. This is a joint decision between you and your care team."}
            </p>
            {disclaimerCard.jointDecisionNote && (
              <p className="text-xs text-text-subtle leading-relaxed mb-6 border-l-2 border-accent/30 pl-3">
                {disclaimerCard.jointDecisionNote}
              </p>
            )}
            <div className="flex gap-3">
              <Button
                variant="secondary"
                size="md"
                className="flex-1"
                onClick={() => setDisclaimerCard(null)}
              >
                Go back
              </Button>
              <a
                href={disclaimerUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="flex-1"
                onClick={() => setDisclaimerCard(null)}
              >
                <Button size="md" className="w-full">
                  Continue to site
                </Button>
              </a>
            </div>
          </div>
        </div>
      )}

      </main>
      <SiteFooter />
    </div>
  );
}
