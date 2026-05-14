import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PageShell } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { RatingStars } from "@/components/marketplace/RatingStars";
import { ProductGrid } from "@/components/marketplace/ProductGrid";
import { GrowAccessoryDisclaimer } from "@/components/marketplace/GrowAccessoryDisclaimer";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/marketplace/queries";
import { FORMAT_LABELS } from "@/lib/marketplace/types";
import { resolveAgeGate } from "@/server/marketplace/age-gate";

// ---------------------------------------------------------------------------
// Metadata
// ---------------------------------------------------------------------------

interface SlugPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: SlugPageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return { title: "Product Not Found" };
  return {
    title: product.name,
    description: product.shortDescription,
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ProductDetailPage({ params }: SlugPageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();
  const requires21Plus = product.requires21Plus ?? false;

  const user = await getCurrentUser();
  if (requires21Plus && !user) {
    redirect(`/login?next=${encodeURIComponent(`/portal/shop/products/${slug}`)}`);
  }

  const patient = user
    ? await prisma.patient.findFirst({
        where: { userId: user.id, deletedAt: null },
        select: { dateOfBirth: true, state: true },
      })
    : null;

  const ageGate = resolveAgeGate({
    requires21Plus,
    isAuthenticated: !!user,
    dateOfBirth: patient?.dateOfBirth,
    destinationState: patient?.state,
  });

  if (requires21Plus && ageGate.status === "blocked_underage") {
    return (
      <PageShell maxWidth="max-w-[680px]">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Badge tone="warning">Not eligible</Badge>
            <h1 className="text-2xl font-semibold">This product is restricted to adults 21+</h1>
            <p className="text-sm text-text-muted">{ageGate.message}</p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (requires21Plus && ageGate.status === "blocked_state") {
    return (
      <PageShell maxWidth="max-w-[680px]">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Badge tone="warning">State restriction</Badge>
            <h1 className="text-2xl font-semibold">Shipping is restricted for your delivery state</h1>
            <p className="text-sm text-text-muted">{ageGate.message}</p>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  if (requires21Plus && ageGate.status === "needs_dob") {
    return (
      <PageShell maxWidth="max-w-[680px]">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <Badge tone="accent">21+ verification required</Badge>
            <h1 className="text-2xl font-semibold">Confirm your date of birth to continue</h1>
            <p className="text-sm text-text-muted">
              We only ask this once. Your date of birth is stored to enforce legal age requirements.
            </p>
            <form action="/api/marketplace/age-gate/confirm" method="post" className="space-y-3">
              <input
                type="date"
                name="dob"
                required
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm"
                aria-label="Date of birth"
              />
              <input type="hidden" name="redirectTo" value={`/portal/shop/products/${slug}`} />
              <Button type="submit" variant="primary" className="w-full">
                Confirm and continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </PageShell>
    );
  }

  const relatedProducts = await getRelatedProducts(product.id);
  const formatLabel = FORMAT_LABELS[product.format] ?? product.format;
  const strainLabel =
    product.strainType && product.strainType !== "n/a"
      ? product.strainType.charAt(0).toUpperCase() + product.strainType.slice(1)
      : null;

  return (
    <PageShell maxWidth="max-w-[900px]">
      {/* ------------------------------------------------------------------ */}
      {/* Breadcrumb                                                         */}
      {/* ------------------------------------------------------------------ */}
      <nav aria-label="Breadcrumb" className="mb-8">
        <ol className="flex flex-wrap items-center gap-1.5 text-sm text-text-subtle">
          <li>
            <Link href="/portal/shop" className="hover:text-text transition-colors duration-200">
              Shop
            </Link>
          </li>
          <li aria-hidden="true" className="select-none">/</li>
          <li>
            <Link
              href="/portal/shop/products"
              className="hover:text-text transition-colors duration-200"
            >
              Products
            </Link>
          </li>
          <li aria-hidden="true" className="select-none">/</li>
          <li className="text-text font-medium truncate max-w-[200px]">
            {product.name}
          </li>
        </ol>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Hero — two-column on desktop                                       */}
      {/* ------------------------------------------------------------------ */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
        {/* Left — image placeholder */}
        <div className="bg-surface-muted rounded-lg aspect-square flex items-center justify-center">
          <span className="text-lg font-medium text-text-subtle select-none">
            {formatLabel}
          </span>
        </div>

        {/* Right — product info */}
        <div className="flex flex-col gap-4">
          {/* Brand */}
          <span className="text-xs uppercase tracking-wide text-text-subtle">
            {product.brand}
          </span>

          {/* Name */}
          <h1 className="text-2xl font-semibold text-text tracking-tight leading-tight">
            {product.name}
          </h1>

          {/* Rating */}
          {product.reviewCount > 0 && (
            <RatingStars rating={product.averageRating} count={product.reviewCount} />
          )}

          {/* Price */}
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-semibold text-text">
              ${product.price.toFixed(2)}
            </span>
            {product.compareAtPrice != null &&
              product.compareAtPrice > product.price && (
                <span className="text-sm text-text-subtle line-through">
                  ${product.compareAtPrice.toFixed(2)}
                </span>
              )}
          </div>

          {/* Clinician Pick callout */}
          {product.clinicianPick && (
            <div className="rounded-lg bg-accent-soft p-4 space-y-2">
              <Badge tone="accent">Clinician Pick</Badge>
              {product.clinicianNote && (
                <p className="text-sm text-text leading-relaxed">
                  {product.clinicianNote}
                </p>
              )}
            </div>
          )}

          {/* Variant selector */}
          {product.variants.length > 1 && (
            <div className="space-y-2">
              <span className="text-xs font-medium uppercase tracking-wide text-text-subtle">
                Size
              </span>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant, idx) => (
                  <button
                    key={variant.id}
                    className={`rounded-md border px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                      idx === 0
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border bg-surface text-text hover:bg-surface-muted"
                    } ${!variant.inStock ? "opacity-50 cursor-not-allowed" : ""}`}
                    disabled={!variant.inStock}
                  >
                    {variant.name}
                    {variant.price !== product.variants[0]?.price && (
                      <span className="ml-1.5 text-text-subtle">
                        ${variant.price.toFixed(2)}
                      </span>
                    )}
                    {variant.upc && (
                      <span className="block text-[10px] text-text-subtle font-mono mt-0.5">
                        UPC: {variant.upc}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Add to cart CTA */}
          <Button
            variant="primary"
            size="lg"
            className="w-full mt-2"
            disabled={!product.inStock}
          >
            {product.inStock ? "Add to Cart" : "Out of Stock"}
          </Button>

          {/* Trust signals */}
          <ul className="flex flex-col gap-1.5 mt-1">
            {product.labVerified && (
              <li className="flex items-center gap-2 text-sm text-text-muted">
                <span className="text-success" aria-hidden="true">&#10003;</span>
                Lab verified &mdash; Certificate of Analysis available
              </li>
            )}
            {product.clinicianPick && (
              <li className="flex items-center gap-2 text-sm text-text-muted">
                <span className="text-success" aria-hidden="true">&#10003;</span>
                Physician curated
              </li>
            )}
            {product.beginnerFriendly && (
              <li className="flex items-center gap-2 text-sm text-text-muted">
                <span className="text-success" aria-hidden="true">&#10003;</span>
                Beginner friendly
              </li>
            )}
          </ul>
        </div>
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Product Details                                                    */}
      {/* ------------------------------------------------------------------ */}
      <section className="space-y-8 mb-12">
        {/* Description */}
        <div>
          <h2 className="text-lg font-semibold text-text mb-3">About This Product</h2>
          <p className="text-sm text-text-muted leading-relaxed">{product.description}</p>
        </div>

        {/* Cannabinoid Profile */}
        {(product.thcContent != null ||
          product.cbdContent != null ||
          product.cbnContent != null ||
          strainLabel) && (
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold text-text mb-4">
                Cannabinoid Profile
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {product.thcContent != null && (
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-text">
                      {product.thcContent}%
                    </p>
                    <p className="text-xs text-text-subtle mt-1">THC</p>
                  </div>
                )}
                {product.cbdContent != null && (
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-text">
                      {product.cbdContent}%
                    </p>
                    <p className="text-xs text-text-subtle mt-1">CBD</p>
                  </div>
                )}
                {product.cbnContent != null && (
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-text">
                      {product.cbnContent}%
                    </p>
                    <p className="text-xs text-text-subtle mt-1">CBN</p>
                  </div>
                )}
                {strainLabel && (
                  <div className="text-center">
                    <p className="text-2xl font-semibold text-text">
                      {strainLabel}
                    </p>
                    <p className="text-xs text-text-subtle mt-1">Strain</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Use Cases — symptoms & goals */}
        {(product.symptoms.length > 0 || product.goals.length > 0) && (
          <div>
            <h3 className="text-sm font-semibold text-text mb-3">Use Cases</h3>
            <div className="flex flex-wrap gap-2">
              {product.symptoms.map((s) => (
                <Badge key={`symptom-${s}`} tone="neutral">
                  {s}
                </Badge>
              ))}
              {product.goals.map((g) => (
                <Badge key={`goal-${g}`} tone="accent">
                  {g}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Dosage Guidance */}
        {product.dosageGuidance && (
          <Card>
            <CardContent className="pt-6">
              <h3 className="text-sm font-semibold text-text mb-2">
                Dosage Guidance
              </h3>
              <p className="text-sm text-text-muted leading-relaxed">
                {product.dosageGuidance}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Onset · Duration · Effect (EMR-278) */}
        {(product.onsetTime || product.duration || (product.effectTags && product.effectTags.length > 0)) && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {product.onsetTime && (
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-text-subtle mb-1">
                  Onset Time
                </p>
                <p className="text-sm font-medium text-text">
                  {product.onsetTime}
                </p>
              </div>
            )}
            {product.duration && (
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-text-subtle mb-1">
                  Duration
                </p>
                <p className="text-sm font-medium text-text">
                  {product.duration}
                </p>
              </div>
            )}
            {product.effectTags && product.effectTags.length > 0 && (
              <div className="rounded-lg border border-border bg-surface p-4">
                <p className="text-xs uppercase tracking-wide text-text-subtle mb-2">
                  Effect
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {product.effectTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center rounded-full bg-[var(--accent)]/10 text-[var(--accent)] text-[11.5px] font-medium px-2 py-0.5 capitalize"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Beginner friendly */}
        {product.beginnerFriendly && (
          <Badge tone="success" className="text-sm px-3 py-1">
            Beginner Friendly
          </Badge>
        )}

        {/* EMR-282 — grow-accessory legal disclaimer */}
        {product.growAccessory && (
          <GrowAccessoryDisclaimer state={patient?.state ?? null} className="mt-6" />
        )}
      </section>

      {/* ------------------------------------------------------------------ */}
      {/* Reviews                                                            */}
      {/* ------------------------------------------------------------------ */}
      {product.reviews.length > 0 && (
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <h2 className="text-lg font-semibold text-text">Reviews</h2>
            <RatingStars rating={product.averageRating} />
            <span className="text-sm text-text-muted">
              {product.averageRating.toFixed(1)} ({product.reviewCount})
            </span>
          </div>

          <div className="space-y-6">
            {product.reviews.map((review) => (
              <div
                key={review.id}
                className="border-b border-border pb-6 last:border-b-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-3 mb-2">
                  <span className="text-sm font-medium text-text">
                    {review.authorName}
                  </span>
                  <RatingStars rating={review.rating} />
                  {review.verified && (
                    <Badge tone="success" className="text-[11px]">
                      Verified Purchase
                    </Badge>
                  )}
                  <span className="text-xs text-text-subtle ml-auto">
                    {new Date(review.createdAt).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </div>
                {review.title && (
                  <p className="text-sm font-semibold text-text mb-1">
                    {review.title}
                  </p>
                )}
                {review.body && (
                  <p className="text-sm text-text-muted leading-relaxed">
                    {review.body}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Related Products                                                   */}
      {/* ------------------------------------------------------------------ */}
      {relatedProducts.length > 0 && (
        <section className="mb-4">
          <h2 className="text-lg font-semibold text-text mb-6">
            You may also like
          </h2>
          <ProductGrid products={relatedProducts} columns={4} />
        </section>
      )}
    </PageShell>
  );
}
