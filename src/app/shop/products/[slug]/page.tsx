import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, ShieldCheck, FlaskConical, ChevronRight, BookOpen } from "lucide-react";
import {
  PRODUCTS,
  getProductBySlug,
  getRelatedProducts,
} from "@/lib/marketplace/data";
import { FORMAT_LABELS, type ProductReview } from "@/lib/marketplace/types";
import { curatedDetailsForMarketplaceProduct } from "@/lib/marketplace/product-details";
import { listProductQuestions, summarizeProductQuestions } from "@/lib/marketplace/qa";
import { resolveDistributor, estimatedDispatchHours } from "@/lib/leafmart/distributors";
import { toCompareItem } from "@/components/store/compare-item";
import { StoreProductCard } from "@/components/store/StoreProductCard";
import { ProductDetailsList } from "@/components/store/ProductDetailsList";
import { ProductQA } from "@/components/store/ProductQA";
import { ReviewsWithPhotos } from "@/components/store/ReviewsWithPhotos";
import { AddToCartPanel } from "@/components/store/AddToCartPanel";
import { ShareButton } from "@/components/store/ShareButton";
import { CompareDrawer } from "@/components/store/CompareDrawer";
import { CompareToggleButton } from "@/components/store/compare-tray";
import { SeedsEarnBadge } from "@/components/store/SeedsEarnBadge";
import { DistributorBadge } from "@/components/store/DistributorBadge";
import { StarRating } from "@/components/store/StarRating";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/ornament";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const product = getProductBySlug(params.slug);
  if (!product) return { title: "Product not found — Leafmart" };
  return {
    title: `${product.name} — Leafmart`,
    description: product.shortDescription,
  };
}

// Demo photo swatches so the reviews surface shows the photo treatment.
const DEMO_SWATCHES = ["var(--sage, #9caf88)", "var(--accent-soft)"];

export default async function ProductDetailPage({ params }: { params: { slug: string } }) {
  const product = getProductBySlug(params.slug);
  if (!product) notFound();

  const details = curatedDetailsForMarketplaceProduct(product);
  const questions = await listProductQuestions(product.slug);
  const aiSummary = summarizeProductQuestions(questions);
  const related = getRelatedProducts(product.id, 6);
  const distributor = resolveDistributor({ firstPartyOnly: product.clinicianPick });

  const compareBase = toCompareItem(product);
  const compareSimilar = related.slice(0, 3).map(toCompareItem);

  const reviews: Array<ProductReview & { photoSwatches?: string[] }> = product.reviews.map((r, i) =>
    i === 0 ? { ...r, photoSwatches: DEMO_SWATCHES } : r,
  );

  const bg = product.bgColor ?? "var(--accent-soft)";
  const deep = product.deepColor ?? "var(--accent)";

  return (
    <div className="px-4 py-6 lg:px-12">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-[12px] text-text-subtle" aria-label="Breadcrumb">
        <Link href="/shop" className="hover:text-text">
          Shop
        </Link>
        <ChevronRight width={13} height={13} />
        <span className="text-text-muted">{FORMAT_LABELS[product.format]}</span>
        <ChevronRight width={13} height={13} />
        <span className="truncate text-text">{product.name}</span>
      </nav>

      {/* Hero */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div
          className="grid min-h-[320px] place-items-center overflow-hidden rounded-3xl"
          style={{ background: `linear-gradient(150deg, ${bg}, ${deep})` }}
        >
          <span className="font-display text-7xl font-medium text-white/85 drop-shadow">
            {product.brand.slice(0, 1)}
          </span>
        </div>

        <div>
          <div className="flex items-center gap-2">
            <Eyebrow>{product.brand}</Eyebrow>
            {product.clinicianPick && (
              <Badge tone="accent">
                <Sparkles width={11} height={11} /> Clinician pick
              </Badge>
            )}
          </div>
          <h1 className="mt-1.5 font-display text-3xl tracking-tight text-text sm:text-4xl">
            {product.name}
          </h1>
          <div className="mt-2 flex items-center gap-3">
            <Link href="#reviews">
              <StarRating rating={product.averageRating} reviewCount={product.reviewCount} size={16} />
            </Link>
          </div>
          <p className="mt-3 text-[15px] leading-relaxed text-text-muted">{product.shortDescription}</p>

          {/* Trust signals */}
          <div className="mt-4 flex flex-wrap gap-2">
            {product.labVerified && (
              <Badge tone="success">
                <FlaskConical width={11} height={11} /> Lab verified
              </Badge>
            )}
            {product.beginnerFriendly && <Badge tone="neutral">Beginner friendly</Badge>}
            {product.requires21Plus && <Badge tone="warning">21+</Badge>}
          </div>

          <div className="mt-4 flex flex-col gap-1.5">
            <DistributorBadge distributor={distributor} />
            <p className="text-[12px] text-text-subtle">
              Typically dispatched within {estimatedDispatchHours(distributor)}h ·{" "}
              {distributor.policies.returnsWindowDays}-day returns
            </p>
          </div>

          {/* Purchase */}
          <div className="mt-5">
            <AddToCartPanel
              slug={product.slug}
              name={product.name}
              brand={product.brand}
              price={product.price}
              distributorId={distributor.id}
            />
          </div>

          {/* Seed Trove loyalty (EMR-313 / EMR-314) */}
          <div className="mt-3">
            <SeedsEarnBadge dollars={product.price} />
          </div>

          {/* Share + Compare (EMR-310) */}
          <div className="mt-3 flex flex-wrap gap-2">
            <ShareButton
              title={product.name}
              text={product.shortDescription}
              url={`/shop/products/${product.slug}`}
              variant="secondary"
              size="sm"
            />
            <CompareDrawer base={compareBase} similar={compareSimilar} triggerSize="sm" />
            <CompareToggleButton item={compareBase} size="sm" />
            <Link
              href={`/shop/dosing-guide?format=${product.format}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong/70 bg-surface-raised px-3.5 text-sm font-medium text-text shadow-sm transition-all hover:bg-surface-muted hover:-translate-y-px"
            >
              <BookOpen width={15} height={15} /> Dosing guide
            </Link>
          </div>
        </div>
      </div>

      {/* AI summary (narrative) — distinct from the structured details list */}
      <section className="mt-8 rounded-2xl border border-border bg-surface-raised p-5 sm:p-6">
        <div className="flex items-center gap-1.5">
          <Sparkles width={14} height={14} className="text-accent" />
          <Eyebrow>AI summary</Eyebrow>
        </div>
        <p className="mt-2 text-[14.5px] leading-relaxed text-text">{product.description}</p>
        {product.clinicianNote && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-accent-soft/50 p-3 text-[13px] text-text">
            <ShieldCheck width={15} height={15} className="mt-0.5 shrink-0 text-accent" />
            <span>
              <span className="font-medium">Clinician note:</span> {product.clinicianNote}
            </span>
          </p>
        )}
      </section>

      {/* Structured details (EMR-307) */}
      <div className="mt-6">
        <ProductDetailsList details={details} />
      </div>

      {/* Q&A (EMR-305) */}
      <div className="mt-6">
        <ProductQA productSlug={product.slug} questions={questions} aiSummary={aiSummary} />
      </div>

      {/* Reviews with photos (EMR-306) */}
      <div className="mt-6">
        <ReviewsWithPhotos
          productName={product.name}
          reviews={reviews}
          averageRating={product.averageRating}
          reviewCount={product.reviewCount}
        />
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-10">
          <Eyebrow className="mb-3">You might also like</Eyebrow>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {related.slice(0, 4).map((p) => (
              <StoreProductCard key={p.slug} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
