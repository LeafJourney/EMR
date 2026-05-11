import Link from "next/link";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { Badge } from "@/components/ui/badge";
import {
  PRODUCTS,
  CATEGORIES,
  searchProducts,
} from "@/lib/marketplace/data";
import { MarketplaceClient } from "./marketplace-client";

export const metadata: Metadata = {
  title: "Marketplace — Leafjourney",
  description:
    "Physician-curated cannabis wellness products. Browse by symptom, goal, or format. Compare, save to your wish list, and read verified patient reviews.",
};

export const revalidate = 3600;

export default function MarketplacePage({
  searchParams,
}: {
  searchParams?: { q?: string; category?: string; sort?: string; brand?: string };
}) {
  const query = searchParams?.q?.trim() ?? "";
  const categorySlug = searchParams?.category ?? "";
  const sort = searchParams?.sort ?? "featured";
  const brandFilter = searchParams?.brand ?? "";

  let products = query ? searchProducts(query) : [...PRODUCTS];
  if (categorySlug) {
    const cat = CATEGORIES.find((c) => c.slug === categorySlug);
    if (cat) products = products.filter((p) => p.categoryIds.includes(cat.id));
  }
  if (brandFilter) {
    products = products.filter((p) => p.brand === brandFilter);
  }

  // Sort
  if (sort === "price-asc") products.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") products.sort((a, b) => b.price - a.price);
  else if (sort === "rating") products.sort((a, b) => b.averageRating - a.averageRating);
  else if (sort === "popular") products.sort((a, b) => b.reviewCount - a.reviewCount);
  else products.sort((a, b) => Number(b.featured) - Number(a.featured));

  // Vendor profiles — derived from the catalog so we never show a vendor
  // that doesn't have any active products.
  const vendorMap = new Map<
    string,
    { name: string; productCount: number; avgRating: number; clinicianPicks: number }
  >();
  for (const p of PRODUCTS) {
    const v = vendorMap.get(p.brand) ?? {
      name: p.brand,
      productCount: 0,
      avgRating: 0,
      clinicianPicks: 0,
    };
    v.productCount += 1;
    v.avgRating += p.averageRating;
    if (p.clinicianPick) v.clinicianPicks += 1;
    vendorMap.set(p.brand, v);
  }
  const vendors = Array.from(vendorMap.values())
    .map((v) => ({ ...v, avgRating: Math.round((v.avgRating / v.productCount) * 10) / 10 }))
    .sort((a, b) => b.clinicianPicks - a.clinicianPicks || b.productCount - a.productCount)
    .slice(0, 6);

  const symptomCats = CATEGORIES.filter((c) => c.type === "symptom");
  const goalCats = CATEGORIES.filter((c) => c.type === "goal");
  const formatCats = CATEGORIES.filter((c) => c.type === "format");
  const collectionCats = CATEGORIES.filter((c) => c.type === "collection");

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

      {/* Hero / search */}
      <section className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-12 pt-10 pb-8">
        <Eyebrow className="mb-5">Marketplace</Eyebrow>
        <h1 className="font-display text-3xl md:text-5xl tracking-tight text-text leading-[1.05] max-w-3xl">
          Physician-curated cannabis wellness — <span className="text-accent">all in one shelf.</span>
        </h1>
        <p className="text-[15px] md:text-base text-text-muted mt-5 max-w-2xl leading-relaxed">
          Search across {PRODUCTS.length} clinician-reviewed products. Filter by symptom, goal,
          or format. Compare side-by-side and save to your wish list.
        </p>

        <form
          action="/marketplace"
          method="GET"
          className="mt-7 flex flex-col sm:flex-row gap-3 max-w-3xl"
          role="search"
        >
          <div className="relative flex-1">
            <input
              type="search"
              name="q"
              defaultValue={query}
              placeholder="Search products, brands, symptoms…"
              aria-label="Search marketplace"
              className="w-full h-12 pl-11 pr-4 rounded-2xl border border-border bg-surface-raised text-[15px] text-text placeholder:text-text-subtle focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
            />
            <svg
              className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-text-subtle pointer-events-none"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden
            >
              <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
          {brandFilter && <input type="hidden" name="brand" value={brandFilter} />}
          <select
            name="sort"
            defaultValue={sort}
            aria-label="Sort by"
            className="h-12 px-4 rounded-2xl border border-border bg-surface-raised text-[14px] text-text"
          >
            <option value="featured">Featured first</option>
            <option value="popular">Most reviews</option>
            <option value="rating">Highest rated</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
          <button
            type="submit"
            className="h-12 px-6 rounded-2xl bg-accent text-white font-medium text-[14px] hover:bg-accent-strong transition-colors"
          >
            Search
          </button>
        </form>
      </section>

      <EditorialRule className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-12" />

      {/* Category nav */}
      <section className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-12 py-8">
        <CategoryRow label="Shop by symptom" cats={symptomCats} active={categorySlug} />
        <CategoryRow label="Shop by goal" cats={goalCats} active={categorySlug} />
        <CategoryRow label="Shop by format" cats={formatCats} active={categorySlug} />
        <CategoryRow label="Collections" cats={collectionCats} active={categorySlug} />
      </section>

      {/* Active filters + product grid */}
      <section className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-12 pb-12">
        <div className="flex items-baseline justify-between flex-wrap gap-3 mb-6">
          <div>
            <h2 className="font-display text-2xl md:text-3xl tracking-tight text-text">
              {query
                ? `Results for “${query}”`
                : categorySlug
                  ? CATEGORIES.find((c) => c.slug === categorySlug)?.name ?? "All products"
                  : brandFilter
                    ? brandFilter
                    : "All products"}
            </h2>
            <p className="text-sm text-text-muted mt-1">{products.length} products</p>
          </div>
          {(query || categorySlug || brandFilter) && (
            <Link
              href="/marketplace"
              className="text-xs text-accent hover:underline font-medium"
            >
              Clear filters
            </Link>
          )}
        </div>

        {products.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface-raised p-12 text-center">
            <p className="font-display text-xl text-text">No products match those filters.</p>
            <p className="text-sm text-text-muted mt-2">
              Try widening your search or{" "}
              <Link href="/marketplace" className="text-accent hover:underline">
                clear filters
              </Link>
              .
            </p>
          </div>
        ) : (
          <MarketplaceClient
            products={products.map((p) => ({
              id: p.id,
              slug: p.slug,
              name: p.name,
              brand: p.brand,
              shortDescription: p.shortDescription,
              price: p.price,
              compareAtPrice: p.compareAtPrice,
              format: p.format,
              thcContent: p.thcContent,
              cbdContent: p.cbdContent,
              cbnContent: p.cbnContent,
              clinicianPick: p.clinicianPick,
              labVerified: p.labVerified,
              beginnerFriendly: p.beginnerFriendly,
              averageRating: p.averageRating,
              reviewCount: p.reviewCount,
              symptoms: p.symptoms,
              goals: p.goals,
              inStock: p.inStock,
              firstReview: p.reviews[0]
                ? {
                    rating: p.reviews[0].rating,
                    title: p.reviews[0].title,
                    body: p.reviews[0].body,
                    authorName: p.reviews[0].authorName,
                  }
                : null,
            }))}
          />
        )}
      </section>

      <EditorialRule className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-12" />

      {/* Vendor profiles */}
      <section className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-12 py-12">
        <div className="max-w-2xl mb-8">
          <Eyebrow className="mb-4">Vendor profiles</Eyebrow>
          <h2 className="font-display text-2xl md:text-3xl text-text tracking-tight">
            Brands carried on the shelf.
          </h2>
          <p className="text-sm text-text-muted mt-3 leading-relaxed">
            Every brand passes our clinician review and lab verification before
            getting listed. Click through to see only their catalog.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {vendors.map((v) => (
            <Link
              key={v.name}
              href={`/marketplace?brand=${encodeURIComponent(v.name)}`}
              className="bg-surface-raised border border-border rounded-2xl p-5 card-hover"
            >
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-accent-soft to-accent/20 flex items-center justify-center mb-3">
                <span className="font-display text-lg text-accent">{v.name[0]}</span>
              </div>
              <p className="font-display text-base text-text leading-tight">{v.name}</p>
              <p className="text-[11px] text-text-subtle mt-1">
                {v.productCount} products · ★ {v.avgRating.toFixed(1)}
              </p>
              {v.clinicianPicks > 0 && (
                <Badge tone="accent" className="mt-2 !text-[9px]">
                  {v.clinicianPicks} clinician pick{v.clinicianPicks > 1 ? "s" : ""}
                </Badge>
              )}
            </Link>
          ))}
        </div>
      </section>

      </main>
      <SiteFooter />
    </div>
  );
}

function CategoryRow({
  label,
  cats,
  active,
}: {
  label: string;
  cats: { id: string; slug: string; name: string; icon?: string; productCount: number }[];
  active: string;
}) {
  if (cats.length === 0) return null;
  return (
    <div className="mb-6 last:mb-0">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-subtle mb-3">
        {label}
      </p>
      <div className="flex flex-wrap gap-2">
        {cats.map((c) => {
          const isActive = c.slug === active;
          return (
            <Link
              key={c.id}
              href={`/marketplace?category=${c.slug}`}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-[13px] transition-colors ${
                isActive
                  ? "bg-accent text-white border-accent"
                  : "bg-surface-raised border-border text-text hover:border-accent/40 hover:bg-surface"
              }`}
            >
              {c.icon && <span aria-hidden>{c.icon}</span>}
              <span className="font-medium">{c.name}</span>
              <span className={`text-[11px] ${isActive ? "text-white/80" : "text-text-subtle"}`}>
                {c.productCount}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
