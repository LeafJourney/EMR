"use client";

import Link from "next/link";
import { useState, useCallback } from "react";
import { ProductImage } from "./ProductImage";
import { useCart } from "@/lib/leafmart/cart-store";

export interface LeafmartVariant {
  id: string;
  name: string;
  price: number;
  compareAtPrice?: number | null;
  inStock: boolean;
}

export interface LeafmartReview {
  id: string;
  authorName: string;
  rating: number;
  title?: string | null;
  body?: string | null;
  verified: boolean;
  createdAt: string;
}

export interface LeafmartProduct {
  slug: string;
  partner: string;
  name: string;
  format: string;
  formatLabel: string;
  support: string;
  dose: string;
  price: number;
  pct: number;
  n: number;
  bg: string;
  deep: string;
  shape: "bottle" | "can" | "jar" | "tin" | "serum" | "box";
  tag?: string;
  imageUrl?: string | null;
  // EMR-276 — multi-image scroll on the product card. When 2+ images
  // are present, the card renders a horizontal scroll-snap carousel
  // with dot indicators. Falls back to single imageUrl when absent.
  images?: string[];

  // Optional richer fields surfaced on the PDP. Older callers (cart, demo data)
  // may omit these; the PDP falls back gracefully when they are absent.
  description?: string;
  compareAtPrice?: number | null;
  averageRating?: number;
  reviewCount?: number;
  labVerified?: boolean;
  coaUrl?: string | null;
  clinicianPick?: boolean;
  clinicianNote?: string | null;
  variants?: LeafmartVariant[];
  reviews?: LeafmartReview[];

  // True when the product is regulated and requires the customer to confirm
  // they are 21 or older before purchase. Derived server-side from THC content
  // (any non-zero THC flips this on); other regulated categories can extend
  // this rule in `mapProductToLeafmart`.
  requiresAgeVerification?: boolean;

  // EMR-280 vendor contact surfaces — optional. When present, the PDP shows
  // a contact card ("Visit site / Call / Email") under the clinician note.
  // The website link goes through a leaving-site disclaimer modal.
  partnerWebsite?: string | null;
  partnerPhone?: string | null;
  partnerEmail?: string | null;
}

export function LeafmartProductCard({ product }: { product: LeafmartProduct }) {
  const p = product;
  const { addItem } = useCart();
  const [justAdded, setJustAdded] = useState(false);

  const handleQuickAdd = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      addItem(p);
      setJustAdded(true);
      setTimeout(() => setJustAdded(false), 1200);
    },
    [addItem, p]
  );

  // EMR-276 — multi-image scroll. When 2+ product images exist, render a
  // horizontal scroll-snap carousel with dot indicators below the card image.
  // 1-image cards still render the original single ProductImage.
  const galleryImages =
    (p.images && p.images.length > 0)
      ? p.images
      : (p.imageUrl ? [p.imageUrl] : []);
  const hasGallery = galleryImages.length > 1;
  const [imageIndex, setImageIndex] = useState(0);
  const handleDot = useCallback((e: React.MouseEvent, i: number) => {
    e.preventDefault();
    e.stopPropagation();
    setImageIndex(i);
  }, []);

  return (
    <Link href={`/leafmart/products/${p.slug}`} className="block card-lift rounded-3xl overflow-hidden bg-[var(--surface)] border border-[var(--border)]">
      <div className="relative">
        {hasGallery ? (
          <>
            <div className="relative">
              <ProductImage
                key={imageIndex}
                src={galleryImages[imageIndex]}
                alt={`${p.name} — image ${imageIndex + 1} of ${galleryImages.length}`}
                shape={p.shape}
                bg={p.bg}
                deep={p.deep}
                height={320}
              />
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/30 backdrop-blur-sm">
                {galleryImages.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    aria-label={`Show image ${i + 1}`}
                    onClick={(e) => handleDot(e, i)}
                    className={`rounded-full transition-all ${
                      i === imageIndex
                        ? "w-4 h-1.5 bg-white"
                        : "w-1.5 h-1.5 bg-white/60 hover:bg-white/85"
                    }`}
                  />
                ))}
              </div>
            </div>
          </>
        ) : (
          <ProductImage src={p.imageUrl} alt={p.name} shape={p.shape} bg={p.bg} deep={p.deep} height={320} />
        )}
        {p.tag && (
          <div
            className="absolute top-4 left-4 px-3 py-1.5 rounded-full text-[11.5px] font-semibold tracking-wide inline-flex items-center gap-1.5 shadow-sm"
            style={{ background: p.deep, color: "#FFF8E8" }}
          >
            <span className="w-[5px] h-[5px] rounded-full" style={{ background: "#FFF8E8", opacity: 0.85 }} />
            {p.tag}
          </div>
        )}
        {/* EMR-276: prominent clinician-pick ribbon, larger than the COA chip. */}
        {p.clinicianPick && (
          <div className="absolute top-3.5 right-3.5 bg-[var(--leaf)] text-white rounded-full pl-2 pr-3 py-1.5 text-[12.5px] font-bold flex items-center gap-1.5 shadow-md tracking-wide">
            <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
              <path d="M7 1l1.7 3.5L12.5 5l-2.8 2.6.7 3.9L7 9.6l-3.4 1.9.7-3.9L1.5 5l3.8-.5L7 1z" fill="currentColor" />
            </svg>
            Clinician Pick
          </div>
        )}
        {!p.clinicianPick && (
          <div className="absolute top-4 right-4 bg-white/85 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-[var(--leaf)] flex items-center gap-1.5 backdrop-blur-sm">
            <svg width="11" height="11" viewBox="0 0 11 11"><circle cx="5.5" cy="5.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M3 5.7L4.5 7.2L7.5 4.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>
            COA
          </div>
        )}
      </div>
      <div className="p-5 flex flex-col flex-1">
        {/* EMR-276: company + format eyebrow goes up a step in size + weight */}
        <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-[var(--text-soft)] mb-2">
          {p.partner} · {p.formatLabel}
        </p>
        <h3 className="font-display text-[22px] font-medium tracking-tight leading-tight text-[var(--ink)] mb-2">{p.name}</h3>
        <p className="text-[13.5px] text-[var(--text-soft)] leading-relaxed flex-1">{p.support}</p>
        <div className="flex justify-between items-center mt-4 pt-3.5 border-t border-[var(--border)]">
          <div>
            <div className="text-[11.5px] text-[var(--muted)] mb-0.5">{p.dose}</div>
            <div className="text-[11.5px] text-[var(--leaf)] font-semibold flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-[var(--leaf)]" />
              {p.pct}% helped · n={p.n}
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="font-display text-[22px] font-medium text-[var(--ink)] tabular-nums">${p.price}</span>
            <button
              onClick={handleQuickAdd}
              aria-label={`Add ${p.name} to cart`}
              className={`group relative rounded-full w-[42px] h-[42px] flex items-center justify-center transition-all duration-300 ${
                justAdded
                  ? "bg-[var(--leaf)] text-[var(--bg)] scale-110"
                  : "bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--leaf)] hover:scale-105"
              }`}
            >
              {justAdded ? (
                <svg width="16" height="16" viewBox="0 0 16 16">
                  <path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 3h1.5l.8 4m0 0L6.5 13h8l1.5-6H5.3z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="7.5" cy="15.5" r="1" fill="currentColor" />
                  <circle cx="13" cy="15.5" r="1" fill="currentColor" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function LeafmartProductGrid({ products }: { products: LeafmartProduct[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-[18px]">
      {products.map((p) => (
        <LeafmartProductCard key={p.slug} product={p} />
      ))}
    </div>
  );
}
