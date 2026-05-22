// EMR-007 — AI-Powered Supply Store on Leafmart.
//
// Public surface for OTC, DME, and supplements that complement the
// cannabis catalog. The page renders all active SupplyProducts; when
// the visitor passes ?symptoms=insomnia,pain (or similar) we run them
// through the recommender so the most relevant items lift to the top.
// Future: when the patient is signed-in, pull symptoms from their
// chart instead of the URL.

import Link from "next/link";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, LeafSprig } from "@/components/ui/ornament";
import { prisma } from "@/lib/db/prisma";
import {
  recommend,
  type SupplyCategory,
  type SupplyProductCandidate,
} from "@/lib/supply-store";

export const metadata = {
  title: "Supply Store",
  description:
    "OTC, DME, and supplements physician-curated to complement your cannabis regimen.",
};

// Catalog counts shift slowly; revalidate hourly for CDN-fast renders
// without baking a snapshot from build time into prod traffic.
export const revalidate = 3600;

const CATEGORY_LABELS: Record<SupplyCategory, string> = {
  cough_cold: "Cough & Cold",
  sleep: "Rest",
  pain: "Pain Relief",
  digestive: "Digestive",
  vitamins_supplements: "Vitamins & Supplements",
  dme: "Durable Medical Equipment",
  topical: "Topicals",
  oral_care: "Oral Care",
  mental_health: "Mental Health",
  womens_health: "Women's Health",
  general_wellness: "General Wellness",
};

const COMMON_SYMPTOMS = ["cough", "sore throat", "insomnia", "pain", "anxiety", "indigestion"];

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function SupplyStorePage({
  searchParams,
}: {
  searchParams?: { symptoms?: string; category?: string };
}) {
  // Catalog reads tolerate DB outages (and unconfigured build envs) so
  // the page still renders the symptom selector + empty-state copy.
  const products = await prisma.supplyProduct
    .findMany({
      where: { active: true },
      orderBy: [{ featured: "desc" }, { name: "asc" }],
    })
    .catch(() => [] as Awaited<ReturnType<typeof prisma.supplyProduct.findMany>>);
  const catalog: SupplyProductCandidate[] = products.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    category: p.category as SupplyCategory,
    description: p.description,
    shortDescription: p.shortDescription,
    imageUrl: p.imageUrl,
    priceCents: p.priceCents,
    symptoms: p.symptoms,
    conditions: p.conditions,
    contraindications: p.contraindications,
    isOTC: p.isOTC,
    requiresRx: p.requiresRx,
    fsaEligible: p.fsaEligible,
    externalUrl: p.externalUrl,
    externalPartner: p.externalPartner,
  }));

  const symptoms = (searchParams?.symptoms ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const categoryParam = searchParams?.category as SupplyCategory | undefined;

  const showRecommended = symptoms.length > 0;
  const recommended = showRecommended
    ? recommend(catalog, {
        symptoms,
        conditions: [],
        contraindications: [],
        categoryFilter: categoryParam ? [categoryParam] : undefined,
      })
    : [];

  const categoryFiltered = categoryParam
    ? catalog.filter((p) => p.category === categoryParam)
    : catalog;

  return (
    <div className="pb-12">
      <div className="max-w-[1100px] mx-auto px-6 lg:px-12 pt-12 pb-8 text-center">
        <Eyebrow className="justify-center mb-4 text-accent">AI-curated</Eyebrow>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight text-text">
          Supply Store
        </h1>
        <p className="text-base text-text-muted mt-4 max-w-xl mx-auto leading-relaxed">
          OTC, DME, and supplements physician-curated to complement your
          cannabis regimen. Tell us what you're working on and we'll surface
          the right tools.
        </p>
      </div>

      {/* Symptom chip selector */}
      <div className="max-w-[1100px] mx-auto px-6 lg:px-12 mb-8">
        <Eyebrow className="mb-3">Tell us what you need</Eyebrow>
        <div className="flex flex-wrap gap-2">
          {COMMON_SYMPTOMS.map((s) => {
            const active = symptoms.includes(s);
            const next = active
              ? symptoms.filter((x) => x !== s)
              : [...symptoms, s];
            const params = new URLSearchParams();
            if (next.length > 0) params.set("symptoms", next.join(","));
            if (categoryParam) params.set("category", categoryParam);
            return (
              <Link
                key={s}
                href={`?${params.toString()}`}
                prefetch={false}
                className={
                  active
                    ? "px-4 py-1.5 rounded-full text-sm font-medium bg-accent text-accent-ink shadow-sm"
                    : "px-4 py-1.5 rounded-full text-sm font-medium bg-surface-raised text-text-muted border border-border hover:border-border-strong hover:text-text"
                }
              >
                {s}
              </Link>
            );
          })}
        </div>
      </div>

      {/* AI Recommended section */}
      {showRecommended && (
        <section className="max-w-[1100px] mx-auto px-6 lg:px-12 mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-2xl text-text tracking-tight">
              Recommended for you
            </h2>
            <span className="text-xs text-text-muted">
              Based on: {symptoms.join(", ")}
            </span>
          </div>
          {recommended.length === 0 ? (
            <Card tone="raised">
              <CardContent className="py-8 text-center text-sm text-text-muted">
                No supply items match those symptoms yet — try a broader filter
                or ask your care team for a referral.
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recommended.map(({ product, matchedSymptoms }) => (
                <Card key={product.id} tone="raised">
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <CardTitle className="text-base">{product.name}</CardTitle>
                        {product.brand && (
                          <CardDescription className="text-xs">
                            {product.brand} · {CATEGORY_LABELS[product.category]}
                          </CardDescription>
                        )}
                      </div>
                      <Badge tone="accent">Match</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-text-muted leading-relaxed mb-3 line-clamp-3">
                      {product.shortDescription ?? product.description}
                    </p>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-display text-lg text-text">
                        {formatPrice(product.priceCents)}
                      </span>
                      {product.fsaEligible && (
                        <span className="text-[10px] text-success uppercase tracking-wide">
                          FSA eligible
                        </span>
                      )}
                    </div>
                    {matchedSymptoms.length > 0 && (
                      <p className="text-[11px] text-accent">
                        ✓ Helps with: {matchedSymptoms.join(", ")}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Browse all */}
      <section className="max-w-[1100px] mx-auto px-6 lg:px-12">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="font-display text-2xl text-text tracking-tight">
            Browse the supply shelf
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href="?"
              className={
                !categoryParam
                  ? "px-3 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-ink"
                  : "px-3 py-1.5 rounded-full text-xs font-medium bg-surface-raised text-text-muted border border-border"
              }
            >
              All
            </Link>
            {(["cough_cold", "sleep", "pain", "digestive", "vitamins_supplements"] as SupplyCategory[]).map(
              (c) => (
                <Link
                  key={c}
                  href={`?category=${c}`}
                  className={
                    categoryParam === c
                      ? "px-3 py-1.5 rounded-full text-xs font-medium bg-accent text-accent-ink"
                      : "px-3 py-1.5 rounded-full text-xs font-medium bg-surface-raised text-text-muted border border-border"
                  }
                >
                  {CATEGORY_LABELS[c]}
                </Link>
              ),
            )}
          </div>
        </div>

        {categoryFiltered.length === 0 ? (
          <Card tone="raised">
            <CardContent className="py-12 text-center">
              <LeafSprig size={32} className="text-accent mx-auto mb-3" />
              <p className="text-sm text-text-muted">
                Nothing on the shelf in this category yet — check back soon.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryFiltered.map((product) => (
              <Card key={product.id} tone="raised">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{product.name}</CardTitle>
                  <CardDescription className="text-xs">
                    {[product.brand, CATEGORY_LABELS[product.category]]
                      .filter(Boolean)
                      .join(" · ")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-text-muted leading-relaxed mb-3 line-clamp-3">
                    {product.shortDescription ?? product.description}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="font-display text-lg text-text">
                      {formatPrice(product.priceCents)}
                    </span>
                    {product.externalUrl ? (
                      <a
                        href={product.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer sponsored"
                      >
                        <Button size="sm" variant="secondary">
                          View
                        </Button>
                      </a>
                    ) : (
                      <Button size="sm" variant="secondary" disabled>
                        Coming soon
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <p className="text-[11px] text-text-subtle max-w-[680px] mx-auto px-6 mt-12 leading-relaxed text-center">
        Supply items are not a substitute for medical advice. If you're managing
        a condition, talk with your care team before adding new supplements or
        OTC medications to your regimen.
      </p>
    </div>
  );
}
