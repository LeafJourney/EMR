// EMR-712 — Marketplace product detail page.
//
// The /marketplace listing renders cards that link here, but until now
// no `[slug]/page.tsx` existed under marketplace/products/ — every card
// → 404. find-and-fix pass 6 (link-integrity) caught 33 dead links.
//
// Design notes:
// - Server component. The data layer (`src/lib/marketplace/data.ts`) is
//   synchronous; there's no point in a client boundary for read-only
//   detail rendering.
// - Visual style matches the listing card pattern in
//   `marketplace-client.tsx`: brand-letter gradient placeholder, warm
//   tokens from --bg/--surface, accent and highlight chips for trust
//   signals.
// - We deliberately do NOT reuse Leafmart's `ProductDetailClient`
//   because that component expects a `LeafmartProduct` shape (UI-mapped
//   for the consumer storefront) and is wired into the cart store +
//   variant selector + dosing guides. Marketplace is an editorial
//   catalog, not a checkout funnel — the simpler PDP keeps shape
//   ownership clear.
// - `curatedDetailsForMarketplaceProduct` was already built (EMR-307)
//   and is the canonical bullet generator for highlights + specs.

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/ornament";
import {
  getProductBySlug,
  getRelatedProducts,
  getCategoryBySlug,
  PRODUCTS,
} from "@/lib/marketplace/data";
import { curatedDetailsForMarketplaceProduct } from "@/lib/marketplace/product-details";
import type { MarketplaceProduct } from "@/lib/marketplace/types";

export const revalidate = 3600;

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Metadata {
  const product = getProductBySlug(params.slug);
  if (!product) return { title: "Product" };
  return {
    title: `${product.name} — ${product.brand}`,
    description: product.shortDescription,
    openGraph: {
      title: `${product.name} — ${product.brand}`,
      description: product.shortDescription,
      type: "website",
      siteName: "Leafjourney Marketplace",
    },
  };
}

function priceLabel(cents: number): string {
  // Marketplace data stores price as whole dollars (not cents) — see
  // `PRODUCTS[].price` in `data.ts`. Keep the helper name generic so
  // future cents-based migration only touches this one function.
  return `$${cents.toFixed(0)}`;
}

function StarBar({ rating, count }: { rating: number; count: number }) {
  const filled = Math.round(rating);
  return (
    <div className="flex items-center gap-2 text-[12px] text-text-subtle">
      <span className="text-amber-500 tracking-tight" aria-hidden="true">
        {"★".repeat(filled)}
        {"☆".repeat(Math.max(0, 5 - filled))}
      </span>
      <span className="tabular-nums">
        {rating.toFixed(1)} · {count} {count === 1 ? "review" : "reviews"}
      </span>
    </div>
  );
}

function ProductImagePlaceholder({ product }: { product: MarketplaceProduct }) {
  // Same gradient-letter pattern as marketplace listing cards. Keeps
  // visual consistency without depending on real product imagery that
  // most catalog entries don't have yet.
  return (
    <div className="aspect-square rounded-2xl bg-gradient-to-br from-accent-soft via-surface to-highlight-soft flex items-center justify-center shadow-sm border border-border">
      <span className="font-display text-7xl text-accent/60 select-none">
        {product.brand[0]}
      </span>
    </div>
  );
}

export default function MarketplaceProductPage({
  params,
}: {
  params: { slug: string };
}) {
  const product = getProductBySlug(params.slug);
  if (!product) notFound();

  const details = curatedDetailsForMarketplaceProduct(product);
  const related = getRelatedProducts(product.id, 4);
  const primaryCategory = product.categoryIds[0]
    ? getCategoryBySlug(product.categoryIds[0].replace(/^cat-/, ""))
    : undefined;

  return (
    <main id="main-content" className="bg-bg min-h-screen">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-12 pt-8 pb-20">
        {/* Breadcrumbs */}
        <nav
          aria-label="Breadcrumb"
          className="mb-6 text-[12px] text-text-subtle flex items-center gap-1.5"
        >
          <Link href="/marketplace" className="hover:text-text">
            Marketplace
          </Link>
          <span aria-hidden="true">/</span>
          {primaryCategory ? (
            <>
              <Link
                href={`/marketplace?category=${primaryCategory.slug}`}
                className="hover:text-text"
              >
                {primaryCategory.name}
              </Link>
              <span aria-hidden="true">/</span>
            </>
          ) : null}
          <span className="text-text">{product.name}</span>
        </nav>

        {/* Hero */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-8 lg:gap-14">
          <ProductImagePlaceholder product={product} />

          <div className="flex flex-col">
            <Eyebrow className="mb-3">{product.brand}</Eyebrow>
            <h1 className="font-display text-3xl sm:text-4xl tracking-tight text-text leading-[1.08] mb-3">
              {product.name}
            </h1>
            <p className="text-[15px] text-text-muted leading-relaxed mb-5">
              {product.shortDescription}
            </p>

            {/* Price + ratings */}
            <div className="flex items-baseline gap-3 mb-4">
              <span className="font-display text-3xl text-text tabular-nums">
                {priceLabel(product.price)}
              </span>
              {product.compareAtPrice &&
              product.compareAtPrice > product.price ? (
                <span className="text-[14px] text-text-subtle line-through tabular-nums">
                  {priceLabel(product.compareAtPrice)}
                </span>
              ) : null}
              <div className="ml-auto">
                <StarBar
                  rating={product.averageRating}
                  count={product.reviewCount}
                />
              </div>
            </div>

            {/* Trust chips */}
            <div className="flex flex-wrap gap-2 mb-5">
              {product.clinicianPick ? (
                <Badge tone="success">Clinician pick</Badge>
              ) : null}
              {product.labVerified ? (
                <Badge tone="success">Lab verified · COA</Badge>
              ) : null}
              {product.beginnerFriendly ? (
                <Badge tone="neutral">Beginner friendly</Badge>
              ) : null}
              {product.requires21Plus ? (
                <Badge tone="warning">21+ only</Badge>
              ) : null}
              {!product.inStock ? (
                <Badge tone="danger">Out of stock</Badge>
              ) : null}
            </div>

            {/* Clinician note */}
            {product.clinicianNote ? (
              <div className="rounded-xl border border-accent/30 bg-accent-soft p-4 mb-5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-accent font-semibold mb-1.5">
                  From the clinical team
                </p>
                <p className="text-[14px] text-text leading-relaxed italic">
                  {product.clinicianNote}
                </p>
              </div>
            ) : null}

            {/* Highlights */}
            {details.highlights.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-5">
                {details.highlights.map((h, i) => (
                  <div
                    key={`${h.label}-${i}`}
                    className="rounded-lg border border-border bg-surface px-3 py-2"
                  >
                    <p className="text-[10.5px] uppercase tracking-[0.12em] text-text-subtle font-medium">
                      {h.label}
                    </p>
                    <p className="text-[13px] text-text font-medium mt-0.5">
                      {h.value}
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Description + Specs */}
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-8 lg:gap-14 mt-14">
          <section>
            <h2 className="font-display text-2xl tracking-tight text-text mb-4">
              About this product
            </h2>
            <p className="text-[15px] text-text leading-relaxed whitespace-pre-line">
              {product.description}
            </p>

            {product.dosageGuidance ? (
              <div className="mt-6 rounded-xl bg-surface-muted p-5">
                <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle font-semibold mb-1.5">
                  Dosage guidance
                </p>
                <p className="text-[14px] text-text leading-relaxed">
                  {product.dosageGuidance}
                </p>
              </div>
            ) : null}
          </section>

          <aside>
            <h2 className="font-display text-2xl tracking-tight text-text mb-4">
              Specs
            </h2>
            <dl className="divide-y divide-border border-y border-border">
              {details.specs.map((s, i) => (
                <div
                  key={`${s.label}-${i}`}
                  className="py-3 grid grid-cols-[120px_1fr] gap-3"
                >
                  <dt className="text-[12px] text-text-subtle uppercase tracking-[0.1em] font-medium">
                    {s.label}
                  </dt>
                  <dd
                    className={`text-[13.5px] ${
                      s.emphasis === "warning"
                        ? "text-highlight font-medium"
                        : "text-text"
                    }`}
                  >
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>

            {/* Variants */}
            {product.variants.length > 0 ? (
              <div className="mt-8">
                <h3 className="text-[11px] uppercase tracking-[0.14em] text-text-subtle font-semibold mb-3">
                  Available sizes
                </h3>
                <ul className="space-y-2">
                  {product.variants.map((v) => (
                    <li
                      key={v.id}
                      className="flex items-baseline justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2"
                    >
                      <span className="text-[13.5px] text-text">{v.name}</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-[14px] text-text tabular-nums">
                          {priceLabel(v.price)}
                        </span>
                        {v.compareAtPrice && v.compareAtPrice > v.price ? (
                          <span className="text-[11px] text-text-subtle line-through tabular-nums">
                            {priceLabel(v.compareAtPrice)}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </aside>
        </div>

        {/* Reviews */}
        {product.reviews.length > 0 ? (
          <section className="mt-14">
            <h2 className="font-display text-2xl tracking-tight text-text mb-5">
              What people are saying
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {product.reviews.slice(0, 6).map((r) => (
                <article
                  key={r.id}
                  className="rounded-xl border border-border bg-surface p-5"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span
                      className="text-amber-500 text-[13px]"
                      aria-label={`${r.rating} out of 5 stars`}
                    >
                      {"★".repeat(r.rating)}
                      {"☆".repeat(Math.max(0, 5 - r.rating))}
                    </span>
                    {r.verified ? (
                      <span className="text-[10px] uppercase tracking-[0.14em] text-accent font-semibold">
                        Verified
                      </span>
                    ) : null}
                  </div>
                  {r.title ? (
                    <p className="font-display text-[15px] text-text mb-1.5">
                      {r.title}
                    </p>
                  ) : null}
                  <p className="text-[13px] text-text-muted leading-relaxed">
                    {r.body}
                  </p>
                  <p className="text-[11px] text-text-subtle mt-3">
                    {r.authorName} · {r.createdAt}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {/* Related */}
        {related.length > 0 ? (
          <section className="mt-16">
            <h2 className="font-display text-2xl tracking-tight text-text mb-5">
              You might also like
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {related.map((p) => (
                <Link
                  key={p.id}
                  href={`/marketplace/products/${p.slug}`}
                  className="group rounded-xl border border-border bg-surface p-4 hover:border-accent transition-colors flex flex-col"
                >
                  <div className="aspect-square rounded-lg bg-gradient-to-br from-accent-soft via-surface to-highlight-soft flex items-center justify-center mb-3">
                    <span className="font-display text-3xl text-accent/60 select-none">
                      {p.brand[0]}
                    </span>
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle font-medium">
                    {p.brand}
                  </p>
                  <h3 className="font-display text-[15px] text-text leading-tight mt-1 line-clamp-2 group-hover:text-accent">
                    {p.name}
                  </h3>
                  <p className="text-[13px] text-text tabular-nums mt-auto pt-3">
                    {priceLabel(p.price)}
                  </p>
                </Link>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
